# Brief dla Claude Code: ulepszenia portalu ZlecOklejanie.pl (etapy 1–6)

Wersja 1 · 29.09.2026 · autor: Claude (Cowork) na podstawie audytu produkcji, kodu i researchu (konkurencja, praktyki marketplace'ów, prawo PL/UE).
Repo: `D:\zlecoklejanie-app` (Next.js + Supabase `puhbcpahnecunwirtgsj`, Vercel) i `D:\zlecoklejanie` (landing, Netlify — **każdy commit = deploy = kredyty; landing zawsze jednym commitem na etap**).
Model: Sonnet. Migracje przygotowuje Claude Code, uruchamia Wojtek w SQL Editorze. Nic destrukcyjnego bez `BEGIN; … COMMIT;` i zgody.

> **KOLEJNOŚĆ:** zaczynamy dopiero, gdy `uslugi-studiow-brief.md` jest skończony (Faza 4, Bramka 4 zaliczona). Ten brief korzysta z `src/lib/uslugi.ts`, `assignStudio` i `studios.services`. Po każdym etapie: stop, raport, czekasz na „ok”.

Oznaczenia: **[R]** oznacza rekomendację Claude'a (próg lub czas do zmiany w ustawieniach), a nie liczbę ze źródła.

---

## Dlaczego (w skrócie)

| Obszar | Stan dziś (sprawdzony 29.09) | Skutek |
|---|---|---|
| Odpowiedź studia | Tylko mail. Brak przypomnień, terminu na wycenę i przycisku „odrzuć”. Nie ma crona. | Zlecenia wiszą. Nie wiadomo, czy studio w ogóle zobaczyło zlecenie. |
| Klient po wycenach | Mail przy każdej wycenie i nic więcej. | Nie wiemy, czy zlecenie doszło do skutku. Opinii prawie nie ma. |
| Opinie | Formularz „Dodaj opinię” na profilu jest otwarty dla każdego i niepowiązany ze zleceniem. Ocena Google jest pokazywana jak nasza i trafia do JSON-LD. | Ryzyko prawne: od 2023 wymagana jest informacja, czy i jak sprawdzamy opinie. Ryzyko SEO i fałszywych opinii. |
| Cookies | `assets/analytics.js` ładuje **Clarity zawsze, przed zgodą**. GA4 w trybie zaawansowanym. | Niezgodne z PKE art. 399 i wytycznymi EROD. |
| Pomiar | Katalog `/wykonawcy` i profile `/wykonawca/*` (Next.js pod zlecoklejanie.pl) **nie mają GA4 ani Clarity**. | Ruch i kliknięcia „Zleć wycenę” z profili są niewidoczne. |
| Profile | `/wykonawca/*`, `/wykonawcy` i blog bez `og:image`. | Studio udostępnia profil na FB/IG i widać go bez obrazka. |
| DSA / P2B | Brak „Zgłoś treść”, punktu kontaktowego i opisu zasad kolejności. Hiline nieopisane w regulaminie jako zróżnicowane traktowanie. | Obowiązki platformy (także mikro). |

Źródła kluczowych tez:
- Szybkość odpowiedzi: HBR 2011 „The Short Life of Online Sales Leads” https://hbr.org/2011/03/the-short-life-of-online-sales-leads (USA, stare dane, korelacja — traktować jako kierunek).
- Fixly: zapytanie wygasa po 24 h lub 5 ofertach https://fixly.pl/tos
- Thumbtack: odsetek odpowiedzi w 1 h https://community.thumbtack.com/discussion/207/what-is-thumbtack-pro-rewards-and-how-does-it-work
- Obowiązek informacji o weryfikacji opinii: https://archiwum.uokik.gov.pl/aktualnosci.php?news_id=19234
- DSA art. 19 (zwolnienia mikro i małych): https://www.eu-digital-services-act.com/Digital_Services_Act_Article_19.html
- P2B 2019/1150: https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX%3A32019R1150
- Clarity consent: https://learn.microsoft.com/en-us/clarity/setup-and-installation/consent-mode
- Wytyczne Google dla opinii w danych strukturalnych: https://developers.google.com/search/docs/appearance/structured-data/review-snippet (sprawdź aktualny zapis przed zmianą)

To nie jest porada prawna. Treści regulaminu przygotuj jako projekt do akceptacji Wojtka; rekomendowana konsultacja z prawnikiem.

---

## ETAP 1 — Szybka zgodność i pomiar (niskie ryzyko, duża wartość)

**1.1 Landing `assets/analytics.js`:**
- Clarity ładować **dopiero po „Akceptuję”**. Przy „Tylko niezbędne” nie ładować wcale. Jeśli zgoda była wcześniej zapisana (`zlec_cookie_consent = granted`), ładować od razu. Dodać wywołanie consent API Clarity zgodnie z dokumentacją.
- GA4 w **trybie podstawowym**: `gtag/js` dopiero po zgodzie.
- Przyciski „Akceptuję” i „Tylko niezbędne” w równorzędnym stylu (ten sam rozmiar i waga).
- W stopce link „Ustawienia cookies” (ponowne otwarcie banera).

**1.2 Aplikacja — strony publiczne pod zlecoklejanie.pl** (`/wykonawcy`, `/wykonawcy/[miasto]`, `/wykonawca/[slug]`): ten sam baner i **ten sam klucz `zlec_cookie_consent`** (to ta sama domena dzięki proxy, więc zgoda z landingu przechodzi). Po zgodzie GA4 (`G-0PBM1QFP0L`) + Clarity (`y9anr0myh0`). Zdarzenia: `profil_zlec_wycene` (klik CTA na profilu, parametr slug), `katalog_filtr` (usługa/miasto), `profil_kontakt` (klik tel/www/IG). Strony panelu (`/admin`, `/studio`, `/klient`, `/grafik`) BEZ analityki.

**1.3 Opinie — uczciwe oznaczenie:**
- Przy sekcji opinii na profilu i w katalogu dodać krótki tekst (dopasuj do stanu po Etapie 3): „Opinie dodają klienci. [Do Etapu 3: Nie sprawdzamy, czy autor skorzystał z usługi.] Każdą opinię przed publikacją czyta administrator. Nie usuwamy opinii za to, że są negatywne.” + link do zasad w regulaminie.
- Ocenę Google pokazywać **osobno**: „Ocena z Google: 4,9 (N opinii, stan na <data>) — nieweryfikowana przez nas”. Nigdy nie mieszać jej ze średnią portalu.
- **Usunąć ocenę Google z `aggregateRating` w JSON-LD** (`src/app/wykonawca/[slug]/page.tsx` ok. linii 371). W danych strukturalnych tylko opinie zebrane na portalu.

**1.4 Informacje przy danych:**
- Formularz zlecenia (landing: index + 30 podstron, jeden commit): „Twoje dane i zdjęcia przekażemy maksymalnie 3 wykonawcom do przygotowania wyceny. Umowę zawierasz bezpośrednio z wybranym wykonawcą.”
- Nad czatem w panelach: „Wiadomości są zapisywane. Administrator może je przeczytać przy zgłoszeniu, sporze lub podejrzeniu nadużycia.” + okres przechowywania. Jeśli nieustalony, placeholder `[X mies.]` do decyzji Wojtka.
- Przy ofertach w panelu klienta: „Umowę zawierasz z wykonawcą — on odpowiada za wykonanie, cenę i reklamacje.”

**1.5 Punkt kontaktowy (DSA art. 11–12):** w stopce landingu i aplikacji: „Kontakt w sprawie treści i zgłoszeń: kontakt@zlecoklejanie.pl (PL, EN)”.

**Bramka 1:** w czystej przeglądarce (tryb incognito) przed zgodą brak żądań do `clarity.ms` i `googletagmanager.com` (sprawdź zakładką Network). Po zgodzie są. Zgoda z landingu działa w katalogu. JSON-LD profilu bez oceny Google. Landing: 1 deploy.

---

## ETAP 2 — Odpowiedź studia: termin, przypomnienia, odrzucenie (największy wpływ)

**2.1 Harmonogram:**
- Endpointy `/api/cron/<zadanie>` chronione `CRON_SECRET` (nagłówek `Authorization: Bearer`).
- Wywołanie co 15 min. **Najpierw sprawdź, na jakim planie jest projekt na Vercelu i czy jego cron pozwala na taką częstotliwość.** Jeśli nie pozwala: `pg_cron` + `pg_net` w Supabase wołające endpoint (migracja + instrukcja dla Wojtka).
- Helper `godzinyRobocze()` [R]: pn–sob 8:00–20:00, Europe/Warsaw. Stałe w `src/lib/sla.ts`, edytowalne w `/admin/ustawienia`.

**2.2 Baza (migracja):**
- `assignment_status` ADD VALUE `declined`, `expired`.
- `order_assignments` dostaje: `responded_at timestamptz`, `decline_reason text`, `reminders_sent smallint default 0`, `due_at timestamptz`.
- **Zmienić trigger `check_max_assignments`**: nie liczyć `declined` ani `expired` (dziś wyklucza tylko `rejected`). Dodać limit łączny [R] 5 przydziałów na zlecenie.
- Uwaga: `rejected` już znaczy „klient wybrał inne” — nie mieszać znaczeń.

**2.3 Link „Wyceń / Odrzuć” bez logowania:**
- Token HMAC (assignment_id + exp 7 dni, sekret `ACTION_LINK_SECRET`) → strona `/o/[token]`.
- Na stronie: podsumowanie zlecenia (bez danych kontaktowych klienta), formularz wyceny (ten sam co w panelu) oraz „Nie wezmę tego zlecenia” z powodem: brak terminu / poza moim zakresem / za daleko / za mało informacji / inne.
- Odmowa ustawia `declined` + `responded_at` i wysyła kartę do Agenta AI.
- Powód „za mało informacji” → karta w Agencie z sugestią dopytania klienta.
- Wycena ustawia `responded_at`.
- Linki w mailu do studia (istniejący `notify` type `assigned`).

**2.4 Przypomnienia i wygasanie [R]:**
- T+4 h roboczych bez odpowiedzi → przypomnienie.
- T+24 h roboczych → ostatnie przypomnienie.
- T+48 h roboczych → `expired`, mail do studia „zlecenie przekazaliśmy dalej” oraz karta w Agencie **„Podmień studio”** z następnym kandydatem (`studioPasuje` = pasuje, najbliżej, bez `is_paused`, nieprzypisany wcześniej) i przyciskiem jednym kliknięciem.
- W `/admin/ustawienia` przełącznik **„Automatyczna podmiana studia”** (domyślnie WYŁ.). Gdy WŁ., system sam przypisuje następnego kandydata przez `assignStudio` bez `force`.
- Każda akcja zapisywana w `email_log` / `admin_actions`.

**2.5 SMS (adapter, opcjonalny):**
- `src/lib/sms.ts` z dostawcą **SMSAPI.pl** (REST, token w `SMSAPI_TOKEN`, nadawca `SMS_SENDER`).
- **Brak tokena = SMS pomijany, wszystko działa mailowo.**
- Użycie: nowe przypisanie do studia (krótko + link tokenowy), przypomnienie T+4 h, alert do Wojtka o nowym zleceniu (`ADMIN_PHONE`) z linkiem do karty w `/admin/agent`.
- Numery normalizować do formatu +48. Logować w `email_log` z kanałem `sms` (dodaj kolumnę `channel`, jeśli jej nie ma).
- Konto SMSAPI zakłada Wojtek sam.

**2.6 Profil studia:** przełącznik „Pauza do <data>” — rozszerzyć istniejące `is_paused` o `paused_until` (automatyczne wznowienie w cronie).

**Bramka 2:** test na zleceniu TEST z testowym studiem:
- link z maila otwiera stronę bez logowania, wycena i odmowa działają;
- przypomnienia wychodzą (na potrzeby testu skróć czasy zmienną środowiskową);
- po wygaśnięciu karta „Podmień studio” proponuje pasujące studio;
- trigger dopuszcza nowe przypisanie po `declined`/`expired`;
- bez `SMSAPI_TOKEN` nic się nie wywala.

---

## ETAP 3 — Klient: domknięcie pętli i opinie zweryfikowane

**3.1 Mail po przypisaniu studiów** (nowy — dziś `notify` typ `assigned` pisze tylko do studia; wysyłać raz, po pierwszym przypisaniu): „Zlecenie trafiło do N wykonawców. Mają 48 h robocze na odpowiedź. Każdą wycenę dostaniesz mailem.” Bez obietnic liczby wycen.

**3.2 „Porównaj oferty”:** po 3 wycenach lub [R] 72 h od pierwszej wyceny. Mail + widok w panelu klienta z tabelą: studio, cena od–do, termin (dni), komentarz, odległość, odznaki (Etap 5). Jeden przycisk „Wybieram” na ofertę (link tokenowy).

**3.3 „Czy wybrałeś wykonawcę?”** [R] dzień 7 bez wyboru. Przyciski tokenowe: <studio X> / jeszcze decyduję (ponów za 7 dni, maks. 1 raz) / rezygnuję / nikt się nie odezwał. Zapis wyniku do zlecenia (użyj istniejącego mechanizmu „doszło / nie doszło” z A4). „Nikt się nie odezwał” → pilna karta w Agencie.

**3.4 Prośba o opinię zweryfikowaną:**
- Wysyłana po oznaczeniu „doszło do skutku” albo [R] 14 dni po wyborze studia.
- Link tokenowy → formularz opinii z `order_id` i `studio_id` z tokena.
- Przypomnienie po 7 dniach, bez nagród za opinię.
- Opinia z `order_id` = etykieta **„Zweryfikowana — zlecenie przez ZlecOklejanie.pl”**.

**3.5 Otwarty formularz „Dodaj opinię” na profilu — zastąpić:**
- (a) Opinie klientów portalu tylko z linku (3.4).
- (b) Studio w swoim panelu może wysłać maks. [R] 5 zaproszeń do klientów spoza portalu (e-mail) → opinia z etykietą „Opinia spoza portalu — nieweryfikowana”.
- (c) Istniejące opinie bez `order_id` oznaczyć jako „spoza portalu”.
- Zaktualizować tekst z 1.3: „Opinie oznaczone »Zweryfikowana« pochodzą od klientów, którzy złożyli zlecenie przez portal. Pozostałe nie są przez nas sprawdzane.” Średnia liczona ze wszystkich opublikowanych, z liczbą zweryfikowanych obok.
- Zakaz opinii od właścicieli i pracowników studiów — w regulaminie (Etap 4).

**3.6 Moderacja z uzasadnieniem (DSA art. 17):** przy odrzuceniu opinii mail do autora: co zrobiono, dlaczego (punkt regulaminu), jak się odwołać (odpowiedź na mail).

**Bramka 3:** pełny przebieg na zleceniu TEST: przypisanie → mail do klienta → 3 wyceny → „Porównaj” → wybór → „doszło” → prośba o opinię → opinia z etykietą „Zweryfikowana”. Otwarty formularz zniknął.

---

## ETAP 4 — Regulamin, DSA, P2B (funkcje i projekt treści)

**4.1 „Zgłoś treść”** przy profilu, każdej opinii i zdjęciu portfolio:
- Formularz: URL (auto), powód, imię, e-mail, oświadczenie o dobrej wierze.
- Tabela `content_reports`, lista w `/admin/zgloszenia` + karta w Agencie.
- Mail z potwierdzeniem przyjęcia, potem mail z decyzją.

**4.2 Status prawny wykonawcy:**
- Pole obowiązkowe „Działam jako: firma (NIP) / osoba bez działalności” w rejestracji (landing studio + wrapper + `/dolacz`, admin, profil).
- Na profilu przy „bez działalności”: „Wykonawca oświadczył, że nie jest przedsiębiorcą — przepisy o prawach konsumenta nie mają zastosowania do umowy z nim.”

**4.3 „Jak układamy wyniki”:** link w katalogu i przy przypisaniu. Opis zgodny z kodem: usługa, odległość, typ wykonawcy, pauza; brak płatnego pozycjonowania; przydział do zlecenia robi ręcznie administrator (maks. 3).

**4.4 Projekt zmian `regulamin.html` i `polityka-prywatnosci.html` (DO AKCEPTACJI — nie publikować bez „ok”):**
- parametry kolejności i przydziału;
- **zróżnicowane traktowanie — Hiline** (właściciel portalu jest współwłaścicielem Hiline, które przyjmuje zlecenia tylko z mazowieckiego; opisać zasady przydziału tam);
- dostęp administratora do danych (czaty, zdjęcia, oferty);
- zasady opinii i moderacji (moderuje człowiek);
- punkt kontaktowy;
- zmiany regulaminu mailem ≥15 dni przed wejściem w życie;
- zawieszenie konta z uzasadnieniem; usunięcie z 30-dniowym wyprzedzeniem;
- odbiorcy danych klienta (maks. 3 wykonawców jako odrębni administratorzy);
- okresy przechowywania.

Przygotuj diff i listę punktów „do potwierdzenia z prawnikiem”.

**4.5 Retencja (przygotować, domyślnie WYŁ.):** cron usuwający leady i zdjęcia zleceń bez przypisania/wyboru po [R] 12 mies. — przełącznik w ustawieniach, okres do decyzji Wojtka.

**Bramka 4:** zgłoszenie treści działa end-to-end; pole statusu prawnego obowiązkowe; projekt regulaminu czeka na akceptację (bez publikacji).

---

## ETAP 5 — Jakość zleceń i profili

**5.1 Kod pocztowy obowiązkowy dla wykonawcy** (landing studio/wrapper/`/dolacz`, admin, profil; walidacja przez `src/lib/kod-pocztowy.ts`). Powód: w dzienniku onboardingu wielokrotnie brakowało kodu, przez co błędnie liczyły się km (np. BELWEDER: 57 zamiast ok. 340 km).

**5.2 Formularz klienta z pytaniami zależnymi od usługi** (kolumna `orders.details jsonb`; landing index + 30 podstron jednym commitem; wyświetlanie w panelu studia, admina i w mailu do studia):
- zmiana koloru: całość/częściowo, kolor i wykończenie, stan lakieru, poprzednia folia, wnęki tak/nie;
- PPF: zakres (przód / pełny przód / całość / elementy), korekta lakieru tak/nie;
- reklama/flota: liczba aut, projekt gotowy / do zrobienia;
- szyby: które szyby;
- wspólne: termin (do 2 tyg. / miesiąc / elastycznie) i budżet w przedziałach (z opcją „nie wiem”).
Mapowanie `submission-created.js` → `landing_leads` → konwersja leada na zlecenie.

**5.3 OG image:**
- dynamiczny `opengraph-image` dla `/wykonawca/[slug]` (nazwa, miasto, usługi, zdjęcie z portfolio, branding portalu: grafit #2b2b2b, zieleń #84c440, Poppins, logo z `logo-mail.png` z repo landingu — skopiować do `public/` aplikacji) oraz dla `/wykonawcy`;
- statyczny og:image dla bloga;
- w panelu studia przycisk „Udostępnij profil” (kopiuj link + gotowy tekst).

**5.4 Odznaki:**
- „Firma zweryfikowana” — admin zaznacza po ręcznym sprawdzeniu NIP w CEIDG/KRS (`studios.verified_business_at`);
- „Zwykle odpowiada w X h” — mediana `responded_at - assigned_at` po ≥5 przydziałach (liczone w cronie dziennym);
- certyfikaty producentów folii (3M, Avery Dennison, XPEL, Hexis, ORAFOL, KPMF, STEK + „inne”) — wybór w profilu, bez płatnych poziomów.
- Pokazywać na profilu, w katalogu, w „Porównaj oferty” i przy przypisaniu.

**5.5 Drobne:**
- filtr miast w katalogu pokazuje slugi i województwa („krakow”, „lodzkie”, „woj-lubelskie”) → nazwy miast z polskimi znakami, bez województw;
- strona `studio/debug` — usunąć lub ograniczyć do admina.

**Bramka 5:** formularz z pytaniami działa na index i przykładowej podstronie; profil udostępniony na FB (Debugger udostępniania) pokazuje obrazek; odznaki widoczne.

---

## ETAP 6 — Pomiar i niezawodność

**6.1 `/admin/metryki`** + mail w poniedziałek 7:00 na zlecoklejaniepl@gmail.com. Definicje (ostatnie 7 i 30 dni):
1. mediana czasu zgłoszenie → przypisanie;
2. % zleceń z ≥1 wyceną w 24 h i w 48 h;
3. % zleceń z ≥3 wycenami;
4. mediana czasu do pierwszej wyceny;
5. odsetek odpowiedzi studiów (wycena lub odmowa w 24 h roboczych);
6. % zleceń z zadeklarowanym wyborem;
7. aktywacja: % wykonawców z ≥1 wyceną w 30 dni;
8. pokrycie: % zleceń z ≥3 pasującymi, niespauzowanymi studiami w [R] 50 km;
9. % wybranych realizacji z opinią.

**6.2 Monitoring (opcjonalny, konta zakłada Wojtek):**
- Sentry dla Next.js (bez `SENTRY_DSN` kod działa bez zmian);
- zewnętrzny monitor dostępności dla zlecoklejanie.pl, aplikacji i funkcji Netlify — tylko instrukcja, bez kodu.

**Bramka 6:** metryki liczą się na danych produkcyjnych; mail testowy dotarł.

---

## Nie robić (świadomie)
- Płatne leady, punkty, „odkryj numer”, otwarta giełda ofert, rankingi „top 10”, płatne poziomy partnerskie. Kłóci się z modelem 0 zł / 0% i przy tej skali szkodzi jakości.
- Escrow / bezpieczna płatność, Instant Book — dopiero przy monetyzacji.
- Widełki cen z własnych wycen („Ile kosztuje…”) — dopiero przy ≥20 prawdziwych wycenach w kategorii [R].

## Zasady stałe — dopisać do `CLAUDE.md` app po Etapie 2
- „Każdy mail/SMS do studia lub klienta z akcją = link tokenowy (`src/lib/action-links.ts`), nie magic link.”
- „Czasy SLA tylko z `src/lib/sla.ts` / ustawień admina.”
- „Analityka wyłącznie po zgodzie (`zlec_cookie_consent`), nigdy w panelach.”

## Komendy do wklejenia w Claude Code (jedna na bramkę)
1. `Przeczytaj ulepszenia-portalu-brief.md. Sprawdź, czy uslugi-studiow-brief.md jest skończony. Jeśli tak — zrób Etap 1 i stop na Bramce 1.`
2. `Zrób Etap 2 zgodnie z briefem. Stop na Bramce 2.`
3. `Zrób Etap 3. Stop na Bramce 3.`
4. `Zrób Etap 4 (regulamin tylko jako projekt do akceptacji). Stop na Bramce 4.`
5. `Zrób Etap 5. Stop na Bramce 5.`
6. `Zrób Etap 6. Stop na Bramce 6.`
