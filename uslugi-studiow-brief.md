# Brief dla Claude Code: jeden słownik usług wykonawców + dobór studia po usłudze

Wersja 1 · 29.09.2026 · autor: Claude (Cowork) · decyzje: Wojtek
Repo: `D:\zlecoklejanie-app` (Next.js + Supabase `puhbcpahnecunwirtgsj`, Vercel auto-deploy z `main`) oraz `D:\zlecoklejanie` (landing, Netlify auto-deploy z `main`).
Model: Sonnet wystarczy do wszystkich faz. Opus tylko wtedy, gdy migracja enum w Fazie 1 zacznie się komplikować.

---

## 1. Problem (stan na 29.09.2026)

- Usługi studia są wolnym tekstem „po przecinku” (`studios.specializations text[]`). W publicznym katalogu jest przez to **68 różnych wpisów** („zmiana koloru”, „Zmiana koloru”, „ZMIANA KOLORU AUTA”, „zmiana koloru / wrap”…).
- **12 z 50** wykonawców nie ma żadnej usługi, 8 ma tylko ogólnik „oklejanie”, 1 ma sam detailing.
- Usługi nie są obowiązkowe: formularz studia i wrappera na stronie głównej, „+ Dodaj wykonawcę” w panelu, edycja studia i profil studia. Obowiązkowe są tylko na `/dolacz`.
- **„Przypisz studio” (`admin/zlecenia/[id]/assign-form.tsx`) nie patrzy na usługi** — sortuje wyłącznie po km. Agent AI (`src/lib/agent/sources/supabase.ts`) też proponuje „najbliższe”, bez usługi.
- Są trzy różne słowniki: formularz klienta (8 opcji), `orders.service_type` (enum: oklejanie, ppf, branding, grafika, inne) i wolny tekst u studia.
- Realny błąd z 29.09: zlecenie Mini F56 S Gdańsk na zmianę koloru zostało przypisane do One Man Army Detailing, które robi PPF, ceramikę i korektę, a zmiany koloru nie.

## 2. Decyzje Wojtka (29.09.2026)

1. **Słownik rozbudowany** (8 pozycji), a nie 4 ogólne.
2. **Od teraz każdy nowy wykonawca MUSI zaznaczyć usługi, zanim trafi do panelu** — dotyczy to każdej ścieżki wejścia.
3. **Uzupełnianie starych studiów, które mają puste albo niejasne usługi (ok. 21), odkładamy na później** (Faza 5 — NIE robić teraz). Wolno zrobić tylko automatyczne, jednoznaczne przepisanie istniejącego tekstu (Faza 1c). Bez maili i bez kontaktu ze studiami.

## 3. Słownik usług — jedyne źródło prawdy

Nowy plik `src/lib/uslugi.ts`. Wszystkie etykiety, mapowania i reguły dopasowania są tylko tutaj. Rozrzucone `serviceLabels` (10 plików: admin/studia/[id], admin/zlecenia, admin/zlecenia/[id], klient/zlecenia/[id], studio, studio/historia, studio/zlecenia, studio/zlecenia/[id], agent/sources/gmail.ts, agent/sources/supabase.ts) zastąpić importem.

| kod | Etykieta | Grupa | Liczy się do „min. 1” | Opcja w formularzu klienta (`usluga`) |
|---|---|---|---|---|
| `zmiana_koloru` | Zmiana koloru (full wrap) | Folie | tak | „Zmiana koloru (wrap)” |
| `detale` | Oklejanie detali (dach, maska, lusterka) | Folie | tak | „Detale (dach, maska, lusterka)” |
| `dechrom` | Dechroming | Folie | tak | **nowa opcja** „Dechroming” |
| `ppf` | PPF bezbarwny (ochrona lakieru) | PPF | tak | „Folia ochronna PPF” |
| `ppf_kolor` | PPF kolorowy | PPF | tak | „PPF kolorowy” |
| `reklama` | Oklejanie reklamowe i branding flot | Reklama | tak | „Oklejenie reklamowe”, „Branding floty” |
| `szyby` | Przyciemnianie szyb | Szyby | tak | **nowa opcja** „Przyciemnianie szyb” |
| `detailing` | Detailing, ceramika, korekta lakieru | Dodatkowo | **nie** (sam nie wystarczy) | — |

Poza słownikiem:
- **Dojazd do klienta** to cecha, a nie usługa. Zapisujemy ją w istniejącej kolumnie `studios.work_mode` jako wartość `u_klienta` (tak jak u wrappera; etykieta jest już w `src/app/wykonawca/[slug]/page.tsx`).
- `studios.specializations` zostaje jako **„Inne usługi (opis)”**: wolny tekst, tylko do profilu, nigdy do dobierania. Danych nie kasować.
- „Projekt graficzny” → `grafika` (graficy, bez filtra studiów). „Inne” → `inne` (bez filtra, z ostrzeżeniem).

**Reguła zgodności** (w `uslugi.ts`, łatwa do zmiany): zlecenie `detale` pasuje też do studiów z `zmiana_koloru`. Wszystko inne dopasowujemy ściśle, 1:1.

Eksporty `uslugi.ts` (propozycja): `USLUGI` (lista z kodem, etykietą, grupą i flagą `core`), `CORE_CODES`, `labelUslugi(kod)` (obsługuje też stare wartości `oklejanie` i `branding` przy odczycie), `mapLandingUsluga(tekst)` (zastępuje `mapServiceType` w `admin/leady/actions.ts`), `mapLandingCheckboxy(payload)` (stare i nowe nazwy `usl_*` → kody + work_mode), `studioPasuje(studioServices, orderService)` → `'pasuje' | 'brak_uslug' | 'nie_robi' | 'bez_filtra'`.

## 4. Baza danych

Migracje przygotowuje Claude Code jako pliki w `supabase/migrations/`. **Uruchamia je Wojtek w SQL Editorze** — Claude Code podaje dokładnie, co wkleić i w jakiej kolejności. Nic destrukcyjnego.

**024a_uslugi_slownik.sql** (niełamiące, odpalić PRZED deployem kodu z Fazy 1):
- `ALTER TYPE service_type ADD VALUE IF NOT EXISTS` dla: `zmiana_koloru`, `detale`, `dechrom`, `ppf_kolor`, `reklama`, `szyby` (w tym skrypcie nie używać nowych wartości — ograniczenie Postgresa).
- `studios.services text[] NOT NULL DEFAULT '{}'` + CHECK: `services <@ ARRAY['zmiana_koloru','detale','dechrom','ppf','ppf_kolor','reklama','szyby','detailing']`.
- Indeks GIN na `studios.services`.

**024b_uslugi_zlecenia.sql** (PO deployu kodu z Fazy 1):
- Przepisanie zleceń: `oklejanie` → `zmiana_koloru`, a jeśli opis zawiera „Usługa (z formularza): Detale” → `detale`. `branding` → `reklama`. `ppf` z opisem „PPF kolorowy” → `ppf_kolor`. Najpierw SELECT-podgląd (jest ok. 5 zleceń), potem UPDATE w `BEGIN; … COMMIT;`.
- CHECK na `orders.service_type NOT IN ('oklejanie','branding')`. Stare wartości enuma zostają w typie, ale nie da się ich już użyć.
- `orders.service_type` DEFAULT → `'inne'` (zamiast mylącego `'oklejanie'`).
- **Trigger `enforce_studio_services`** (BEFORE INSERT OR UPDATE na `studios`): błąd „Aktywny wykonawca musi mieć zaznaczoną min. 1 usługę”, gdy `NEW.status='active' AND NEW.deleted_at IS NULL AND NOT (NEW.services && CORE)` ORAZ (`TG_OP='INSERT'` LUB `OLD.status <> 'active'` LUB `NEW.services IS DISTINCT FROM OLD.services`). Dzięki temu stare, nieuzupełnione studia da się dalej edytować, pauzować i usuwać, ale nie da się aktywować ani dodać nowego bez usług.

**025_uslugi_automapowanie.sql** (Faza 1c): patrz niżej.

## 5. Fazy (bramka po każdej — stop, raport, czekasz na „ok” Wojtka)

### Faza 0 — porządki przed startem
1. App: otwarte PR-y #14, #15, #16 (agent, testy 2/2 zielone) → sprawdzić, zmergować do `main` po kolei (squash), rozwiązać ewentualne konflikty, potwierdzić deploy na Vercelu. Przejść na `main`, `git pull`.
2. Landing: lokalny `main` jest rozjechany z originem (lokalnie `0d9014e` docs, na zdalnym `240f1d5` redirect `/studio`) → `git pull --rebase origin main`, potem `git push`. Nie ruszać plików — lokalnie są tylko różnice CRLF (`git diff --ignore-cr-at-eol` jest pusty).
3. Nowa gałąź `feature/uslugi-slownik` w app.
**Bramka 0:** PR-y zmergowane, produkcja działa, landing zsynchronizowany.

### Faza 1 — słownik + baza + etykiety (bez zmian w zachowaniu)
- 1a: `src/lib/uslugi.ts` + skrypt `scripts/check-uslugi.mjs` sprawdzający mapowania (stare i nowe `usl_*`, wszystkie opcje `usluga` z landingu, stare `oklejanie`/`branding` przy odczycie). Repo nie ma test runnera — nie dodawać nowych zależności, zwykły `node` wystarczy.
- 1b: migracje 024a/024b (pliki + instrukcja dla Wojtka), podmiana wszystkich `serviceLabels` i `mapServiceType` na `uslugi.ts`, typy w `src/types/database.ts`. `ORDER_SERVICES` w `admin/zlecenia/[id]/actions.ts`, formularz nowego zlecenia (`admin/zlecenia/new`) i `order-edit.tsx` → nowe kody (bez `oklejanie`/`branding`).
- 1c: **automapowanie jednoznaczne** — SQL generujący podgląd: `business_name | specializations (stare) | proponowane services | niejednoznaczne?`. Reguły deterministyczne (bez polskich znaków, małe litery): `zmiana koloru|full wrap|wrap|vinyl` → zmiana_koloru; `kolorow.*ppf|ppf kolor|zmiana koloru.*ppf` → ppf_kolor; `ppf|folie ochronne|folia ochronna` → ppf; `reklam|brand|flot` → reklama; `szyb|okien` → szyby; `dechrom` → dechrom; `detal(e|i) ` (dach/maska/lusterka) → detale; `detailing|ceramik|powlok|korekt|polerow` → detailing; `dojazd` → work_mode `u_klienta`. Reguły działają addytywnie. Wiersze z konfliktem (np. „zmiana koloru PPF” łapie i `zmiana_koloru`, i `ppf_kolor`) oznacz w podglądzie jako „do sprawdzenia”. **Sam „oklejanie” bez dopowiedzenia i pusta lista = zostaw puste** (to Faza 5). Wynik jako tabela w raporcie + UPDATE w `BEGIN; … COMMIT;` do odpalenia przez Wojtka.
- `npx tsc --noEmit` + `npm run build` + `node scripts/check-uslugi.mjs` muszą przejść.
**Bramka 1:** migracje odpalone, etykiety wszędzie nowe, stare zlecenia wyświetlają się poprawnie, tabela automapowania zaakceptowana i odpalona.

### Faza 2 — usługi obowiązkowe na każdym wejściu
Wspólny komponent `UslugiCheckboxy` (grupy z tabeli w pkt 3 + przełącznik „Dojazd do klienta” + pole „Inne usługi (opis)”). Walidacja **zawsze po stronie serwera** (server actions), nie tylko w UI.
- `admin/studia/add-studio-form.tsx` + `admin/studia/actions.ts` (dodawanie i edycja): checkboxy zamiast tekstu; bez min. 1 usługi z grupy core → błąd „Zaznacz co najmniej jedną usługę”. Dotyczy studia i wrappera.
- `admin/studia/studio-manage.tsx`, `admin/studia/[id]/*`: edycja przez ten sam komponent; akcja „Aktywuj” dla oczekującego bez usług → blokada z komunikatem.
- `studio/profil/profile-form.tsx` (+ jego action): checkboxy, zapis bez usług zablokowany. Na `/studio` (dashboard) **baner** dla studia bez usług: „Zaznacz swoje usługi — bez tego nie dostaniesz zleceń” → link do profilu. Tylko baner, bez maili.
- `src/lib/onboarding.ts` (auto-onboarding z landingu): `mapLandingCheckboxy` obsługuje stare nazwy (`usl_wrap`, `usl_reklama`, `usl_szyby`, `usl_ppf`, `usl_dechrom`, `usl_mobilnie`) i nowe (`usl_<kod>`). Uwaga: dziś `usl_dechrom` wrappera ginie, a „dojazd do klienta” ląduje jako specjalizacja — naprawić. **Zgłoszenie bez żadnej usługi core → NIE zakładać konta**; lead zostaje w `/admin/leady` z oznaczeniem „brak usług — konto nie utworzone”. Wtedy Wojtek dodaje wykonawcę ręcznie przez formularz, który wymaga usług.
- `admin/studia/page.tsx`: plakietka „⚠ brak usług”, filtr „Bez usług (N)”, licznik na dashboardzie admina. Eksport CSV: kolumna `services` (etykiety).
- Grafików (`designers`) NIE ruszamy — to osobny temat.
**Bramka 2:** test — próba dodania studia bez usług (panel) → blokada; z usługami → OK; profil studia bez usług → blokada; trigger w SQL: test w transakcji z `ROLLBACK`; onboarding z testowym payloadem bez usług → brak konta, lead oznaczony.

### Faza 3 — dobór po usłudze (sedno)
- **„Przypisz studio”**: przypisanie przenieść z klienta (dziś `supabase.from("order_assignments").insert` w przeglądarce) do **server action** `assignStudio(orderId, studioId, { force })`, która sprawdza `studioPasuje`, zapisuje, ustawia status i woła `/api/notify` jak dotąd.
- UI nad polem: „Wymagana usługa: <etykieta>”. Lista w 3 sekcjach, w każdej sortowanie po km i chipy usług:
  1. **Pasujące (N)** — domyślnie otwarte.
  2. **Bez zaznaczonych usług (N) — sprawdź ręcznie** (stare studia; szary podpis ze starym tekstem `specializations`, kolor ostrzegawczy).
  3. **Nie robią tej usługi (N)** — zwinięte pod „Pokaż niepasujące”.
  - Przypisanie z sekcji 2 lub 3 → okno potwierdzenia „<Studio> nie ma zaznaczonej usługi <X>. Przypisać mimo to?” → `force: true` + wpis w `admin_actions` (akcja `assign_mismatch`, payload: order, studio, usługa).
  - Zlecenie `inne`/`grafika` → jedna lista po km + informacja „usługa nieokreślona — dobierz ręcznie”.
  - Wyszukiwarka szuka we wszystkich sekcjach.
- **Agent AI** (`src/lib/agent/sources/supabase.ts` + wykonawca akcji `assign_studio`): kandydaci tylko z „Pasujące”, a w treści karty nazwa wymaganej usługi. Gdy brak pasujących: „Brak studiów z usługą <X> w regionie — sprawdź studia bez usług: …”, bez przycisku auto-przypisania. Akcja `assign_studio` idzie przez `assignStudio` bez `force`, więc niepasujące studio zwraca błąd.
- **Katalog publiczny** (`src/lib/catalog.ts`, `src/app/wykonawcy/*`): filtr usług = słownik (8 pozycji + „Dojazd do klienta”) zamiast 68 wpisów; filtrowanie po `services`; chipy na kartach z etykiet słownika. Stare studia bez `services` zostają w katalogu, pokazujemy stary tekst jako „Inne”.
- **Profil publiczny** `/wykonawca/[slug]`: sekcja „Usługi” (słownik) + „Dojazd do klienta” + „Inne usługi”.
- Maile (`lead-alert`, `notify-assigned`, `studio-welcome`) — etykiety z `uslugi.ts`.
**Bramka 3:** test na zleceniu Mini F56 S Gdańsk (zmiana koloru): Unique Car Studio w „Pasujące”, One Man Army w „Nie robią” (po automapowaniu ma ppf + detailing); potwierdzenie przy wymuszeniu działa, wpis w `admin_actions` jest; agent nie proponuje One Man Army; katalog pokazuje 8 filtrów.

### Faza 4 — landing (JEDEN commit — kredyty Netlify)
Repo `D:\zlecoklejanie`. Faza 2 musi być już na produkcji (onboarding rozumie nowe nazwy).
- Formularz studia (`index.html` #partnerzy), formularz wrappera (`wykonawca-freelancer`) i `dolacz.html`: checkboxy wg słownika (`usl_<kod>`, pogrupowane jak w pkt 3) + „Dojeżdżam do klienta” (`usl_mobilnie`, bez zmiany nazwy). Walidacja JS: min. 1 usługa core (wzór: `dolacz.html`, `#uslugiError`). `required` na checkboxach nie działa dla grupy.
- Select klienta `usluga`: dodać „Dechroming” i „Przyciemnianie szyb” — w `index.html` **i we wszystkich 30 podstronach `uslugi/*.html`** (formularz jest wklejony w każdą) oraz wszędzie, gdzie `grep -rn 'name="usluga"'` coś znajdzie.
- `netlify/functions/submission-created.js`: podsumowanie usług w mailu dla nowych nazw.
- Test na produkcji: wysłanie bez usług → blokada; zgłoszenie testowe „TEST … (do usunięcia)” → konto z usługami w panelu.
**Bramka 4:** jeden deploy Netlify, testy OK, dane testowe wypisane do usunięcia (SQL w `BEGIN/COMMIT` dla Wojtka).

### Faza 5 — NA PÓŹNIEJ (nie robić bez osobnej decyzji Wojtka)
Uzupełnienie ok. 21 starych studiów bez usług lub z samym „oklejanie”: propozycja z ich www/IG → akceptacja Wojtka → ewentualnie mail „zaznacz usługi” z przyciskiem w panelu („Poproś o uzupełnienie”).

## 6. Zasady stałe — dopisać do `CLAUDE.md` obu repo (w Fazie 1)
- „Usługi wykonawców: wyłącznie słownik z `src/lib/uslugi.ts` (kody w tabeli). Nowa usługa = zmiana w `uslugi.ts` + migracja CHECK + checkbox na landingu (index, dolacz, wrapper) + opcja w select klienta (index + 30 podstron). Nigdy wolny tekst do dobierania.”
- „Przypisanie studia tylko przez `assignStudio` (server action) — nigdy insert do `order_assignments` z przeglądarki.”
- „Pola IG — wspólny helper” (zasada z 28.09) obowiązuje też w nowych formularzach.

## 7. Poza zakresem (zanotowane, nie robić teraz)
- Filtr miast w katalogu pokazuje slugi i województwa („krakow”, „lodzkie”, „woj-lubelskie”) zamiast nazw miast.
- Strona `studio/debug` jest dostępna na produkcji — do przejrzenia.
- Specjalizacje grafików to też wolny tekst.

## 8. Komendy do wklejenia w Claude Code (po kolei, jedna na bramkę)
1. `Przeczytaj uslugi-studiow-brief.md. Zrób Fazę 0 i zatrzymaj się na Bramce 0 z raportem.`
2. `Zrób Fazę 1 zgodnie z briefem. Migracje przygotuj, ja je odpalę. Stop na Bramce 1.`
3. `Zrób Fazę 2 zgodnie z briefem. Stop na Bramce 2.`
4. `Zrób Fazę 3 zgodnie z briefem. Stop na Bramce 3.`
5. `Zrób Fazę 4 (landing, jeden commit). Stop na Bramce 4.`
