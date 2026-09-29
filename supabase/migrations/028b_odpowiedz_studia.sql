-- =============================================
-- 028b_odpowiedz_studia.sql  (Etap 2 ulepszeń — krok 2 z 2; po 028a)
-- Odpowiedź studia: termin, przypomnienia, odrzucenie, pauza do daty, ustawienia SLA.
-- Idempotentna, nic nie kasuje.
-- =============================================

-- 1. Kolumny przypisania.
--    due_at IS NOT NULL = przypisanie objęte pilnowaniem terminu (cron). Stare przypisania
--    zostają z due_at = NULL, więc studia NIE dostaną przypomnień o starych zleceniach.
ALTER TABLE public.order_assignments
  ADD COLUMN IF NOT EXISTS responded_at    timestamptz,
  ADD COLUMN IF NOT EXISTS decline_reason  text,
  ADD COLUMN IF NOT EXISTS reminders_sent  smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_at          timestamptz;

CREATE INDEX IF NOT EXISTS idx_order_assignments_sla
  ON public.order_assignments (assigned_at)
  WHERE status = 'pending' AND due_at IS NOT NULL;

-- 2. Trigger limitu: aktywne przypisania (bez rejected/declined/expired) max 3,
--    a wszystkich przypisań łącznie (z historią odmów i wygaśnięć) max 5.
CREATE OR REPLACE FUNCTION public.check_max_assignments()
RETURNS trigger AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.order_assignments
      WHERE order_id = NEW.order_id
        AND status NOT IN ('rejected', 'declined', 'expired')) >= 3 THEN
    RAISE EXCEPTION 'Maksymalnie 3 studia mogą być przypisane do zlecenia';
  END IF;
  IF (SELECT COUNT(*) FROM public.order_assignments WHERE order_id = NEW.order_id) >= 5 THEN
    RAISE EXCEPTION 'Maksymalnie 5 przypisań łącznie na zlecenie (z historią odmów)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Pauza do daty (automatyczne wznowienie robi cron).
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS paused_until timestamptz;

-- 4. Kanał w historii powiadomień (email | sms).
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email';

-- 5. Ustawienia aplikacji (klucz → JSON). Tylko service_role (kod serwera po requireAdmin()).
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.profiles(id)
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
-- Brak polityk: dostęp wyłącznie przez service_role.

-- Domyślnie: automatyczna podmiana studia WYŁĄCZONA.
INSERT INTO public.app_settings (key, value)
VALUES ('auto_podmiana', '{"wlaczona": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
