-- =============================================
-- 014_designer_matching.sql
-- Faza 1 doboru grafika: sygnal "chce grafika" + przypisanie grafika do
-- zlecenia + brief wyslany mailem, ze sladem w bazie.
--
-- Migracja ADDYTYWNA i idempotentna: 1 nowa kolumna, 1 nowa tabela, backfill.
-- Nie zmienia istniejacych tabel ani polityk.
-- URUCHOMIC PRZED wdrozeniem kodu — panel czyta orders.needs_designer.
-- =============================================

-- ---------------------------------------------
-- 1. Sygnal: klient chce, zebysmy dobrali grafika
-- Zrodlo: pole `potrzebuje_grafika` z formularza na landingu (landing_leads.payload).
-- Admin moze tez ustawic recznie, gdy klient poprosi telefonicznie.
-- ---------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS needs_designer BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.orders.needs_designer IS
  'Klient chce, zebysmy dobrali grafika (sygnal z formularza lub ustawiony przez admina).';

CREATE INDEX IF NOT EXISTS idx_orders_needs_designer
  ON public.orders (created_at DESC)
  WHERE needs_designer;

-- ---------------------------------------------
-- 2. Przypisanie grafika do zlecenia + brief
--
-- `brief` to MIGAWKA tresci wyslanej grafikowi, nie referencja do zlecenia.
-- Powod jest dwojaki:
--  * RODO — grafik na tym etapie NIE dostaje kontaktu do klienta. Tabela
--    `orders` ma w `description` m.in. telefon klienta, wiec nie otwieramy
--    grafikom dostepu do zlecen; dostaja tylko to, co admin swiadomie wyslal.
--  * slad — wiadomo dokladnie, co grafik dostal, nawet gdy zlecenie sie zmieni.
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_designer_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES public.orders(id)    ON DELETE CASCADE,
  designer_id   UUID NOT NULL REFERENCES public.designers(id) ON DELETE CASCADE,
  brief         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'rejected')),
  email_status  TEXT CHECK (email_status IN ('sent', 'failed', 'skipped')),
  email_error   TEXT,
  assigned_by   UUID REFERENCES public.profiles(id),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  response_note TEXT,
  UNIQUE (order_id, designer_id)
);

COMMENT ON TABLE public.order_designer_assignments IS
  'Grafik przypisany do zlecenia przez admina + brief, ktory dostal mailem.';

CREATE INDEX IF NOT EXISTS idx_oda_order
  ON public.order_designer_assignments (order_id, assigned_at);
CREATE INDEX IF NOT EXISTS idx_oda_designer
  ON public.order_designer_assignments (designer_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_oda_pending
  ON public.order_designer_assignments (designer_id)
  WHERE status = 'pending';

-- ---------------------------------------------
-- 3. RLS
-- Tylko ODCZYT. Wstawianie briefu i zapis odpowiedzi (accepted/rejected)
-- idzie przez backend kluczem service_role, ktory omija RLS — dzieki temu
-- grafik nie moze podmienic tresci briefu ani przypisac sie sam.
-- coalesce(): get_my_role() zwraca NULL dla konta bez profilu (patrz 009).
-- ---------------------------------------------
ALTER TABLE public.order_designer_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Designer reads own briefs" ON public.order_designer_assignments;
CREATE POLICY "Designer reads own briefs" ON public.order_designer_assignments
  FOR SELECT
  USING (designer_id = auth.uid());

DROP POLICY IF EXISTS "Admin reads designer briefs" ON public.order_designer_assignments;
CREATE POLICY "Admin reads designer briefs" ON public.order_designer_assignments
  FOR SELECT
  USING (coalesce(get_my_role() = 'admin', false));

-- ---------------------------------------------
-- 4. Backfill sygnalu na istniejacych zleceniach
--  * zlecenia typu 'grafika' — sama grafika to z definicji robota dla grafika,
--  * zlecenia z leada, gdzie klient zaznaczyl "potrzebuje grafika" — konwerter
--    dopisywal wtedy to zdanie do opisu (patrz convertLeadToOrder).
-- Idempotentne: ustawia tylko tam, gdzie jeszcze false.
-- ---------------------------------------------
UPDATE public.orders
   SET needs_designer = TRUE
 WHERE needs_designer = FALSE
   AND (
     service_type = 'grafika'
     OR description ILIKE '%prosi o dobranie grafika%'
   );
