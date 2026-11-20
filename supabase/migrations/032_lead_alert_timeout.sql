-- =============================================
-- 032_lead_alert_timeout.sql
-- Dłuższy czas oczekiwania na /api/lead-alert (5 s → 30 s).
--
-- Powód (Etap 7, Bramka 1, 20.11.2026): z włączonym automatem przypisań
-- /api/lead-alert robi dużo więcej (zlecenie, wybór studiów z danymi geo,
-- przypisanie, maile) i trwa ok. 10 s. pg_net domyślnie czeka 5 s i zrywa
-- połączenie — Vercel wtedy przerywa funkcję i NIC się nie zapisuje
-- (ani zlecenie, ani mail do admina; lead zostaje 'new').
--
-- Ta sama funkcja co w 007, różni się tylko `timeout_milliseconds`.
-- maxDuration trasy to 60 s, więc 30 s ma zapas z obu stron.
-- Migracja jest idempotentna.
-- =============================================

CREATE OR REPLACE FUNCTION public.notify_new_landing_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $fn$
BEGIN
  PERFORM net.http_post(
    url := 'https://zlecoklejanie-app.vercel.app/api/lead-alert',
    body := jsonb_build_object('leadId', NEW.id),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 30000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Powiadomienie jest best-effort: awaria HTTP nie może wywalić INSERTa
  -- leada, bo stracilibyśmy zgłoszenie klienta.
  RAISE WARNING 'lead-alert webhook failed: %', SQLERRM;
  RETURN NEW;
END;
$fn$;
