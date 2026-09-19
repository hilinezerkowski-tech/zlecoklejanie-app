-- =============================================
-- 012_order_messages.sql
-- Czat klient <-> studio w ramach zlecenia + podglad admina.
--
-- ZASADY:
--  * Rozmowa = para (zlecenie, studio). Klient ma osobna rozmowe z kazdym
--    studiem, studia nie widza sie nawzajem.
--  * Rozmowa istnieje dopiero, gdy studio wyslalo wycene na to zlecenie.
--  * Pisac moga klient i studio. Admin tylko czyta.
--  * Po rozstrzygnieciu pisac mozna tylko w rozmowie z WYBRANYM studiem.
--    Zlecenie zakonczone/anulowane = rozmowy tylko do odczytu.
--
-- Migracja jest ADDYTYWNA (nowa tabela + 2 funkcje) — nie zmienia
-- istniejacych tabel ani polityk. Idempotentna.
-- =============================================

CREATE TABLE IF NOT EXISTS order_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id)  ON DELETE CASCADE,
  studio_id   UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,  -- klucz rozmowy
  sender_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('client', 'studio')),
  body        TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_messages_thread
  ON order_messages (order_id, studio_id, created_at);

-- ---------------------------------------------
-- Rola wywolujacego w danej rozmowie: 'client' | 'studio' | 'admin' | NULL.
-- SECURITY DEFINER: sprawdza orders/quotes bez zaleznosci od ich polityk RLS.
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.message_thread_role(p_order_id uuid, p_studio_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  IF coalesce(get_my_role() = 'admin', false) THEN
    RETURN 'admin';
  END IF;

  -- Rozmowa istnieje tylko, gdy to studio wycenilo to zlecenie
  IF NOT EXISTS (
    SELECT 1 FROM quotes q
     WHERE q.order_id = p_order_id AND q.studio_id = p_studio_id
  ) THEN
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM orders o WHERE o.id = p_order_id AND o.client_id = v_uid) THEN
    RETURN 'client';
  END IF;

  IF p_studio_id = v_uid THEN
    RETURN 'studio';
  END IF;

  RETURN NULL;
END;
$fn$;

-- ---------------------------------------------
-- Czy w rozmowie mozna jeszcze pisac (niezaleznie od tego, kto pisze).
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.message_thread_open(p_order_id uuid, p_studio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN o.status IN ('completed', 'cancelled') THEN false
    WHEN o.status = 'chosen' THEN EXISTS (
      SELECT 1 FROM quotes q
       WHERE q.id = o.chosen_quote_id AND q.studio_id = p_studio_id
    )
    ELSE true
  END
  FROM orders o
  WHERE o.id = p_order_id;
$fn$;

-- ---------------------------------------------
-- RLS
-- ---------------------------------------------
ALTER TABLE order_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Thread parties and admin read messages" ON order_messages;
CREATE POLICY "Thread parties and admin read messages" ON order_messages
  FOR SELECT
  USING (message_thread_role(order_id, studio_id) IS NOT NULL);

DROP POLICY IF EXISTS "Thread parties post messages" ON order_messages;
CREATE POLICY "Thread parties post messages" ON order_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_role = message_thread_role(order_id, studio_id)
    AND coalesce(message_thread_open(order_id, studio_id), false)
  );

-- Brak UPDATE/DELETE: wiadomosci sa niezmienne (czysty slad dla admina).
