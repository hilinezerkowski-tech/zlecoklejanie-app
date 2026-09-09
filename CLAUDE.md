# zlecoklejanie-app — aplikacja marketplace

Kontekst biznesowy i zasady: `../CLAUDE.md` (folder nadrzędny). Ten plik = jak pracować w tym repo.

## Stack

- Next.js (App Router), Supabase (Auth + Postgres + RLS), Vercel (auto-deploy z `main`).
- Supabase projekt `puhbcpahnecunwirtgsj` ("Zleć Oklejanie"). SQL Editor: `supabase.com/dashboard/project/puhbcpahnecunwirtgsj/sql/new`.

## Baza danych

- Tabele: `landing_leads`, `orders`, `studios`, `designers`, `quotes`, `notifications`, `order_assignments`, `profiles`.
- Migracje do `010_contact_exchange.sql`; funkcja `get_order_contact` (SECURITY DEFINER) do wymiany kontaktu po zatwierdzeniu.
- **`profiles` = UNRESTRICTED** — włączyć RLS przed uruchomieniem Auth dla użytkowników. Otwarty punkt RODO (art. 32).
- **Nieodwracalne operacje** (DELETE, TRUNCATE, DROP): Claude przygotowuje SQL w bloku `BEGIN; ... COMMIT;` z komentarzem co robi, Wojtek uruchamia sam w SQL Editorze. Nigdy nie wykonywać automatycznie.

## Panele

- Panel klienta i panele wykonawców (studio / grafik) — gotowe, testowane lokalnie.
- Panel admina (zatwierdzanie zgłoszeń przez Wojtka) — DO ZROBIENIA, wymaga Supabase Auth + RLS.

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
