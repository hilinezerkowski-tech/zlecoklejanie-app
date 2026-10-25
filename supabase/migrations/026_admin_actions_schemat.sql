-- =============================================
-- 026_admin_actions_schemat.sql
-- Naprawa dziennika akcji admina (admin_actions).
--
-- Migracja 023 robiła CREATE TABLE IF NOT EXISTS — tabela istniała już wcześniej
-- w starszej postaci (id, created_at, admin_id, entity, entity_id uuid, action,
-- payload), więc 023 niczego nie zmieniła. Kod zapisuje jednak kolumny `result`
-- i `error` oraz w entity_id tekstowe id karty agenta (np. 'order:<uuid>'),
-- a zapis jest „best effort” — każdy insert padał po cichu (0 wierszy w tabeli).
--
-- Tabela jest pusta, więc zmiana typu entity_id jest bezpieczna. Idempotentna.
-- Nic nie jest kasowane.
-- =============================================

BEGIN;

ALTER TABLE public.admin_actions
  ADD COLUMN IF NOT EXISTS result text NOT NULL DEFAULT 'ok',   -- 'ok' | 'error'
  ADD COLUMN IF NOT EXISTS error text;

-- entity_id: uuid → text (id zlecenia albo id karty agenta). Istniejące wartości
-- (jeśli jakieś są) przechodzą 1:1 jako tekst.
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'admin_actions' AND column_name = 'entity_id') = 'uuid' THEN
    ALTER TABLE public.admin_actions ALTER COLUMN entity_id TYPE text USING entity_id::text;
  END IF;
END $$;

-- payload NOT NULL zostaje — kod zawsze wysyła obiekt.

CREATE INDEX IF NOT EXISTS admin_actions_created_idx ON public.admin_actions (created_at DESC);
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
-- Brak polityk: dostęp tylko service_role po requireAdmin() w kodzie serwera.

COMMIT;

-- Kontrola:
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'admin_actions' ORDER BY ordinal_position;
