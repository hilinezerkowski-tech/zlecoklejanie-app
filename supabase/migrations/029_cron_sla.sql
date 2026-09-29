-- =============================================
-- 029_cron_sla.sql  (Etap 2 ulepszeń — harmonogram)
-- Wywołuje endpoint /api/cron/sla co 15 minut: przypomnienia, wygasanie przypisań,
-- wznowienie studiów z pauzą do daty.
--
-- Dlaczego pg_cron, nie Vercel Cron: na planie Hobby Vercel pozwala tylko na wywołanie
-- raz dziennie, a potrzebujemy 15 min. pg_cron + pg_net w Supabase działa niezależnie od planu.
--
-- PRZED ODPALENIEM:
--  1. Ustaw w Vercelu (Production) zmienną CRON_SECRET (długi losowy ciąg) i ACTION_LINK_SECRET
--     (drugi, inny losowy ciąg), potem zrób redeploy.
--  2. W Supabase: Database → Extensions → włącz `pg_cron` i `pg_net`.
--  3. Podmień poniżej <CRON_SECRET> na TĘ SAMĄ wartość co w Vercelu (nie wklejaj jej do repo!).
--  4. Adres: ustaw właściwą domenę aplikacji (ta sama, co NEXT_PUBLIC_SITE_URL).
-- Idempotentna: najpierw kasuje poprzedni harmonogram o tej nazwie (tylko ten jeden).
-- =============================================

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'zlec-sla';

SELECT cron.schedule(
  'zlec-sla',
  '*/15 * * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://zlecoklejanie-app.vercel.app/api/cron/sla',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $job$
);

-- Podgląd: SELECT * FROM cron.job WHERE jobname = 'zlec-sla';
-- Historia: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- Odpowiedzi endpointu: SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;
-- Wyłączenie: SELECT cron.unschedule('zlec-sla');
