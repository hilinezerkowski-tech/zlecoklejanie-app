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

## Automatyzacja przypisań (Etap 7, `autonomia-przypisywania-brief.md`)

- Kolejność wg decyzji Wojtka (19.11): filtr (Faza 3) → automatyczna zamiana lead → zlecenie + auto-przypisanie (Faza 1) → ranking → geo-fallback → agent tylko z wyjątkami.
- Filtr duplikatów i spamu: `src/lib/automation/filtr-zgloszen.ts`, reguły bez zależności w `filtr-reguly.ts` (kontrola: `node scripts/check-filtr.mjs`). Wołany w `/api/lead-alert` dla `kind='zlecenie'`, zawsze (bez przełącznika). Tylko oznacza (`landing_leads.auto_flag`, migracja 031) — lead zostaje `new`, karta w agencie; oznaczonego zgłoszenia automat nigdy nie przetwarza.
- Formularz klienta nie ma pola imienia — nie dodawać reguły „puste imię”.
- Każda automatyczna akcja = wpis w `admin_actions` z `entity='automation'`, `admin_id` NULL.
- Automat (Faza 1): `src/lib/automation/auto-przypisanie.ts` (`automatZgloszenia` = lead → zlecenie → przypisanie), reguły wyboru bez zależności w `auto-reguly.ts` (kontrola: `node scripts/check-automat.mjs`). Przełącznik `app_settings.auto_przypisanie` w `/admin/ustawienia`, domyślnie WYŁ. Wołany w `/api/lead-alert` tylko przy WŁ. i bez flagi filtra.
- Zamiana lead → zlecenie wyłącznie przez `utworzZlecenieZLeada` (`src/lib/automation/zlecenie-z-leada.ts`) — używa jej też przycisk w `/admin/leady`.
- Wybór studiów: tylko `studioPasuje = pasuje`, bez pauzy, do 3 najlepszych w kolejnych promieniach (km z `geo.ts`). Wyjątki = karta w agencie (powód w faktach karty z `admin_actions`): grafika/inne, nierozpoznane miasto, brak kandydatów, jedynym kandydatem Hiline. Klient wskazał wykonawcę (`payload.wykonawca`) → tylko on, jeśli pasuje.
- `/api/lead-alert` z automatem trwa ok. 10 s — trigger `notify_new_landing_lead` musi mieć `timeout_milliseconds` 30000 (migracja 032). Domyślne 5 s pg_net zrywa połączenie i Vercel przerywa funkcję: nic się nie zapisuje, nawet mail do admina.
- SMS do admina o nowym zleceniu idzie tylko, gdy automat NIE przypisał (Wojtek reaguje tylko na wyjątki).
- Ranking (Faza 2, `uszereguj` w `auto-reguly.ts`): odległość, ale studia w odstępie < 10 km to remis → mniej przypisań z 7 dni (bez declined/expired/rejected) wyżej, przy równym obciążeniu kolejność losowa. Kryterium „tempo odpowiedzi” pominięte — odznaki z Etapu 5.4 jeszcze nie ma.
- Geo-fallback (Faza 4): promienie z `app_settings.automat_promienie` (domyślnie 50/100/200 km, edycja w `/admin/ustawienia`, walidacja `oczyscPromienie`). Bierzemy najmniejszy promień z kandydatem; gdy w promieniu jest tylko Hiline — szukamy dalej. Użyty promień zapisuje się w `admin_actions.payload.promienKm`. Nie mylić z `PROMIEN_KM` w `catalog-geo.ts` (katalog publiczny).
- Agent tylko z wyjątkami (Faza 5): z konstrukcji — przypisane zlecenie ma status `assigned`, więc karta „nowe zlecenie” zostaje tylko dla wyjątków i przy WYŁ. przełączniku. „Log automatyzacji” pod kartami w `/admin/agent` (`log-automatyzacji.tsx`, 7 dni z `admin_actions`). Mail poniedziałkowy z Etapu 6 jeszcze nie istnieje — po jego zbudowaniu dopisać linię „N automatycznie, M wyjątków”.

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

## Katalog publiczny — SEO (07.10.2026)

- Miasto wykonawcy na stronach publicznych: `miastoStudia()` z `src/lib/miasta.ts` (odporne na bałagan w adresach, kanoniczna nazwa, miejscownik `wMiescie()`). `cityFromAddress`/`citySlug` z `studio-location.ts` zostają dla doboru studiów i agenta — nie mieszać.
- Nowe miasto w katalogu: dopisz wpis do `MIASTA` w `miasta.ts` (nazwa + „w …"); bez wpisu strona działa, ale z neutralnym „w miejscowości X".
- Strony miast buduje `stronyMiast()` (`src/lib/catalog-geo.ts`, tylko serwer — wciąga 7 MB danych geo): wykonawcy lokalni + w promieniu 50 km, link do cennika na landingu. 10 miast z cennikami ma stronę także bez lokalnego wykonawcy, jeśli ktoś jest w promieniu.
- `noindex` + poza sitemapą: profil „pusty" (`czyPustyProfil` w `catalog.ts` — bez usług, opisu i zdjęć) oraz strona miasta, na której nie ma żadnego uzupełnionego profilu. Wraca do indeksu samo po uzupełnieniu.
- `/sitemap.xml` i `/robots.txt` są publiczne w middleware (sitemapa idzie pod `zlecoklejanie.pl/sitemap-wykonawcy.xml` przez proxy Netlify). `robots.ts` blokuje domenę vercel.app, ale MUSI przepuszczać `/_next/static/` — stamtąd katalog pod zlecoklejanie.pl ładuje CSS/JS.
- Lustro tych reguł po stronie landingu: `D:\zlecoklejanie\scripts\seo-wykonawcy.mjs` (lista wykonawców na 30 podstronach usług). Zmiana reguły tu = zmiana tam.

## Płatne wyceny — punkty (Gate 1, brief „Gate 1 — płatność za wycenę", 20.11.2026)

- 1 punkt = 1 wysłana wycena. Przypisanie i odmowa są darmowe. Zużycie liczy BAZA: trigger `trg_zuzyj_punkt_za_wycene` (BEFORE INSERT na `quotes`, migracja 033) — łapie wycenę z panelu (RLS) i z linku `/o/<token>` (service role). Brak punktów = wyjątek `BRAK_PUNKTOW` (rozpoznaje go `czyBrakPunktow` z `src/lib/punkty.ts`). Nigdy nie odejmuj punktów w kodzie aplikacji.
- Przełącznik `app_settings.platne_wyceny` w `/admin/ustawienia`, domyślnie WYŁ. Regulamin (§ Opłaty): opłaty ogłaszamy wykonawcom min. 30 dni przed włączeniem.
- Punkty startowe (`app_settings.punkty.start`, domyślnie 10) nadaje trigger przy aktywacji studia (`trg_punkty_przy_aktywacji`) — każda droga aktywacji, tylko raz na studio. Pakiet (`pakiet_punkty`, `pakiet_cena_zl`) ustawia admin; pusty = doładowanie niedostępne.
- Tabele: `punkty_studia` (saldo, `zwolnione`), `punkty_ruchy` (historia; `quotes.punkty_id_transakcji` wskazuje ruch), `platnosci` (P24). Studio tylko SELECT swoich (RLS); zapis przez funkcje bazy / service role.
- Hiline jest zwolnione (`punkty_studia.zwolnione`) — celowo nie kolumna w `studios`, bo studio może edytować swój wiersz `studios`.
- Przy WŁ. płatnych wycenach automat i podmiana pomijają studia bez punktów (`studiaBezPunktow`); ręczne przypisanie przez admina działa dalej.
- Trigger `trg_studios_chron_pola` (033): sesja samego studia nie zmieni `status`, `verified_*`, `deleted_at`, ocen Google itd. — tylko admin / service role.
- Faktury za punkty na start wystawia Wojtek ręcznie (P24 ich nie wystawia). Kontrola reguł: `node scripts/check-punkty.mjs`.
- Przelewy24 (Faza 2): `src/lib/p24.ts` (REST v1, podpisy SHA-384 o stałej kolejności kluczy), `src/lib/platnosci.ts` (płatność → P24 → webhook). Env: `P24_MERCHANT_ID`, `P24_POS_ID`, `P24_CRC`, `P24_API_KEY`; domyślnie sandbox, produkcja dopiero z `P24_SANDBOX=0`. Bez kluczy albo bez pakietu w ustawieniach przycisk doładowania jest nieaktywny. Status kluczy widać w `/admin/ustawienia`.
- Webhook `/api/p24/webhook` jest publiczny (middleware): sprawdza podpis, merchant/pos, kwotę z wiersza `platnosci`, robi PUT `/transaction/verify`, dopiero potem `zaksieguj_platnosc()` (migracja 034, idempotentna). Kwota i liczba punktów zawsze z bazy. Po wpłacie mail „[Faktura]” do admina z danymi studia.
- Doładowanie działa z panelu (`/studio/punkty`) i z linku w mailu (`/o/<token>`, studio z przypisania). Kontrola podpisów: `node scripts/check-p24.mjs`.
