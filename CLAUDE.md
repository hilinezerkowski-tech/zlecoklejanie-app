# zlecoklejanie-app — aplikacja marketplace

Kontekst biznesowy i zasady: `../CLAUDE.md` (folder nadrzędny). Ten plik = jak pracować w tym repo.

**Jedyna kanoniczna kopia: `D:\zlecoklejanie-app`.** Kopia na `C:\Users\Hyperbook\Desktop\zlecoklejanie-app` została skonsolidowana i usunięta (25.09.2026) — mniej miejsca na C:. Wszystkie pliki (kod, notatki, briefy typu `agent-admin-brief.md`) twórz wyłącznie tutaj, nigdy w innej lokalizacji. Po sklonowaniu na nowo: `npm install` (node_modules/.next celowo nie były przenoszone — regenerowalne).

## Stack

- Next.js (App Router), Supabase (Auth + Postgres + RLS), Vercel (auto-deploy z `main`).
- Supabase projekt `puhbcpahnecunwirtgsj` ("Zleć Oklejanie"). SQL Editor: `supabase.com/dashboard/project/puhbcpahnecunwirtgsj/sql/new`.

## Baza danych

- Tabele: `landing_leads`, `orders`, `studios`, `designers`, `quotes`, `notifications`, `order_assignments`, `profiles`.
- Migracje w `supabase/migrations/` (ostatnie: 024a/024b/024c/025 — słownik usług); przed nową sprawdzić numer; funkcja `get_order_contact` (SECURITY DEFINER) do wymiany kontaktu po zatwierdzeniu.
- **`profiles` = UNRESTRICTED** — włączyć RLS przed uruchomieniem Auth dla użytkowników. Otwarty punkt RODO (art. 32).
- **Nieodwracalne operacje** (DELETE, TRUNCATE, DROP): Claude przygotowuje SQL w bloku `BEGIN; ... COMMIT;` z komentarzem co robi, Wojtek uruchamia sam w SQL Editorze. Nigdy nie wykonywać automatycznie.

## Panele

- Panel klienta i panele wykonawców (studio / grafik) — gotowe, testowane lokalnie.
- Panel admina (zatwierdzanie zgłoszeń przez Wojtka) — DO ZROBIENIA, wymaga Supabase Auth + RLS.

## Usługi wykonawców — słownik

- Usługi wykonawców: wyłącznie słownik z `src/lib/uslugi.ts` (kody: `zmiana_koloru`, `detale`, `dechrom`, `ppf`, `ppf_kolor`, `reklama`, `szyby`, `detailing`; zlecenia dodatkowo `grafika`, `inne`). Nowa usługa = zmiana w `uslugi.ts` + migracja CHECK (`studios_services_slownik`) i wartość enuma `service_type` + checkbox na landingu (index, dolacz, wrapper) + opcja w select klienta (index + 30 podstron `uslugi/*`). Nigdy wolny tekst do dobierania.
- `studios.services` = do dobierania; `studios.specializations` = „Inne usługi (opis)”, tylko do profilu. Dojazd do klienta = `work_mode` `u_klienta`, nie usługa.
- Przypisanie studia tylko przez `assignStudio` (server action) — nigdy insert do `order_assignments` z przeglądarki.
- Pola IG — wspólny helper (zasada z 28.09) obowiązuje też w nowych formularzach.
- Kontrola mapowań: `node scripts/check-uslugi.mjs` (bez zależności, Node ≥ 23.6).

## Analityka i zgoda

- Analityka (GA4 `G-0PBM1QFP0L`, Clarity `y9anr0myh0`) wyłącznie po zgodzie (`zlec_cookie_consent`) i tylko na stronach publicznych (`/wykonawcy`, `/wykonawca/*` — layouty z `PublicAnalytics`). Nigdy w panelach (`/admin`, `/studio`, `/klient`, `/grafik`). Logika w `src/lib/analytics.ts` jest lustrem `assets/analytics.js` z landingu — zmieniasz jedno, zmień drugie.
- Oceny Google są pokazywane osobno i opisane jako nieweryfikowane; nie trafiają do średniej portalu ani do JSON-LD.

## Odpowiedź studia i harmonogram

- Każdy mail/SMS do studia lub klienta z akcją = link tokenowy (`src/lib/action-links.ts`, strona `/o/<token>`, HMAC + ważność 7 dni, sekret `ACTION_LINK_SECRET`), nie magic link. Brak sekretu → mail wraca do linku do panelu.
- Czasy SLA (przypomnienia 4 h / 24 h, wygaśnięcie 48 h roboczych, godziny robocze pn–sob 8–20 Europe/Warsaw) tylko z `src/lib/sla.ts` albo ustawień admina (`app_settings`, klucz `sla`). Tryb testowy: `SLA_TEST=1` (1 h robocza = 1 minuta).
- Status przypisania: `declined` = studio odmówiło, `expired` = brak odpowiedzi w terminie, `rejected` = klient wybrał inne studio. Limity: 3 aktywne + 5 łącznie na zlecenie (trigger `check_max_assignments`, 028b).
- Cron: `/api/cron/sla` co 15 min z pg_cron + pg_net (migracja 029, sekret `CRON_SECRET`). `/api/cron/retencja` domyślnie tylko liczy; usuwa dopiero z `RETENCJA_USUWAJ=1` i `?usun=1`.
- SMS (`src/lib/sms.ts`, SMSAPI.pl): opcjonalny, brak `SMSAPI_TOKEN` = pomijany. Env: `SMSAPI_TOKEN`, `SMS_SENDER`, `ADMIN_PHONE`.
- Automatyczna podmiana studia po wygaśnięciu: przełącznik w `/admin/ustawienia`, domyślnie WYŁ.; zawsze przez `przypiszStudia` bez `force`.

## Powiadomienia — KRYTYCZNE

Wszystkie powiadomienia platformy (nowe zlecenia, rejestracje studiów, zgłoszenia grafików, leady z landingu) muszą trafiać na **`zlecoklejaniepl@gmail.com`**, NIE na `hiline.zerkowski@gmail.com`.

Do sprawdzenia i poprawienia:
- env `ADMIN_ALERT_EMAIL` na Vercelu
- fallback w `app/api/lead-alert/route.ts` (lub analogicznej ścieżce)

Dopóki to nie jest potwierdzone, zgłoszenie studia może przepaść w niewłaściwej skrzynce. To blokuje start rekrutacji wykonawców.

## Dane testowe

Wszystkie obecne rekordy to testy (m.in. `grzegorz@brandfit.pl`, Land Rover Discovery Sport, Kraków, 28.08.2026). Nie traktować jako klientów. Wyczyścić przed pierwszym prawdziwym wejściem — SQL przygotować do ręcznego uruchomienia.

## E-mail transakcyjny

Resend, nadawca `powiadomienia@send.zlecoklejanie.pl`, domena zweryfikowana. Konto Resend na `hiline.zerkowski@gmail.com`. Po zmianach w mailach: potwierdzić w logach Resend.

## Weryfikacja

Po każdym pushu na `main`: sprawdzić deploy na Vercelu i przeklikać zmienioną ścieżkę na produkcji.
