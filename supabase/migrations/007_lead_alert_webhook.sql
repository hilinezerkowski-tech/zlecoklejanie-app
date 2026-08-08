-- =============================================
-- 007_lead_alert_webhook.sql
-- Powiadomienie e-mail o nowym leadzie z landing page.
--
-- Po INSERT do landing_leads trigger woła (przez pg_net, asynchronicznie)
-- endpoint /api/lead-alert w aplikacji na Vercelu, a ten wysyła maila do
-- admina przez Resend.
--
-- Dlaczego pg_net, a nie Database Webhook z panelu: projekt nie ma
-- zainstalowanego schematu `supabase_functions`, a własny trigger jest
-- odtwarzalny z repo i widoczny w historii migracji.
--
-- WAŻNE: endpoint musi być wyłączony z guardu w src/middleware.ts —
-- pg_net nie wysyła ciasteczek sesji, więc middleware zamieniało POST na
-- redirect na /login (HTTP 405). Patrz `publicPaths` w middleware.
--
-- Migracja jest idempotentna.
-- =============================================

CREATE EXTENSION IF NOT EXISTS pg_net;

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
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Powiadomienie jest best-effort: awaria HTTP nie może wywalić INSERTa
  -- leada, bo stracilibyśmy zgłoszenie klienta.
  RAISE WARNING 'lead-alert webhook failed: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_notify_new_landing_lead ON public.landing_leads;
CREATE TRIGGER trg_notify_new_landing_lead
  AFTER INSERT ON public.landing_leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_landing_lead();

-- Diagnostyka: odpowiedzi HTTP lądują w net._http_response
--   SELECT status_code, content FROM net._http_response ORDER BY created DESC LIMIT 5;
