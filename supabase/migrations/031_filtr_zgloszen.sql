-- =============================================
-- Etap 7 (autonomia przypisywania), Faza 3 — filtr duplikatów i spamu
-- =============================================
-- Flaga ustawiana automatycznie przez /api/lead-alert dla zgłoszeń klientów
-- (src/lib/automation/filtr-zgloszen.ts). Oznaczone zgłoszenie zostaje 'new'
-- w /admin/leady i dostaje kartę w /admin/agent — automat nigdy go nie przetworzy.
-- Tylko dodaje kolumny, niczego nie usuwa. Bezpieczne do ponownego uruchomienia.

ALTER TABLE public.landing_leads
  ADD COLUMN IF NOT EXISTS auto_flag text,
  ADD COLUMN IF NOT EXISTS auto_flag_details jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'landing_leads_auto_flag_check') THEN
    ALTER TABLE public.landing_leads
      ADD CONSTRAINT landing_leads_auto_flag_check CHECK (auto_flag IN ('duplikat', 'spam'));
  END IF;
END $$;

-- Karty agenta szukają nowych, oznaczonych zgłoszeń klientów.
CREATE INDEX IF NOT EXISTS landing_leads_auto_flag_idx
  ON public.landing_leads (created_at)
  WHERE auto_flag IS NOT NULL;
