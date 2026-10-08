# ZlecOklejanie.pl — Agent AI w panelu admina (brief do Claude Code)

**Repo:** `zlecoklejanie-app` (Next.js App Router + Supabase + Vercel). Landing (`zlecoklejanie`, Netlify) NIE dotykamy.
**Cel:** zakładka `/admin/agent` — jedna lista kart „co czeka na decyzję" ze wszystkich źródeł (zlecenia, rejestracje, skrzynka Gmail, komentarze i DM FB/IG), z sugestią AI i przyciskami, które od razu wykonują akcję. Admin decyduje, agent NIE działa sam.
**Stan:** Faza 0 (UI na mocku) jest w repo: `src/app/(dashboard)/admin/agent/` — `types.ts`, `agent-dashboard.tsx`, `page.tsx`, `mock-data.ts`. Buduj na tych typach.

---

## 0. Zasady nadrzędne

1. **Najpierw obejrzyj repo.** Znajdź: klienta Supabase service_role, `requireAdmin()`, helper maila w `src/lib/notify-assigned.ts`, `sendStudioWelcome()` w onboardingu, tabele `email_log` i `admin_actions`, istniejące zapytania w `/admin/zlecenia` i `/admin/studia` (stamtąd bierz nazwy kolumn — nie zgaduj).
2. **Nie duplikuj logiki.** Przypisanie studia, mail z zapytaniem, aktywacja konta — wołaj istniejące funkcje, nie pisz drugich.
3. **Każda akcja agenta = wpis w `admin_actions`** (`entity='agent'`, `action=<kind>`, `payload` z id karty i treścią). Każdy mail → `email_log`.
4. **Sekrety tylko po stronie serwera** (env na Vercelu). Nigdy w komponentach klienckich.
5. **1 faza = 1 commit** na branchu `feature/agent-fN`, `npx tsc --noEmit` zielone, test na podglądzie Vercel, potem merge do `main`. Migracje SQL odpal w Supabase SQL Editor PRZED deployem kodu.
6. **Pliki mają CRLF** — zachowaj. `next.config.mjs` nie ignoruje błędów TS — każdy błąd wali build.
7. Po każdej fazie zatrzymaj się i podaj Wojtkowi: co zrobione, jak przetestować, komendy git do PowerShella.

---

## 1. Model danych (wspólny dla wszystkich faz)

Typy z `types.ts` obowiązują: `AgentCard { id, type, priority, source, occurredAt, title, facts[], suggestion, actions[] }`.

`id` karty musi być **stabilny** między odświeżeniami (np. `order:<uuid>`, `studio:<uuid>`, `mail:<threadId>`, `fb:<commentId>`, `ig:<messageId>`) — po nim działa ukrywanie i cache sugestii.

### Migracja `018_agent.sql`
```sql
create table public.agent_dismissed (
  card_id text primary key,
  dismissed_by uuid references public.profiles(id),
  dismissed_at timestamptz default now()
);
create table public.agent_suggestions (
  card_id text primary key,
  input_hash text not null,          -- hash faktów; zmiana faktów = nowa sugestia
  suggestion text not null,
  draft text,
  priority text,
  model text,
  created_at timestamptz default now()
);
alter table public.agent_dismissed enable row level security;
alter table public.agent_suggestions enable row level security;
-- dostęp tylko przez service_role z checkiem requireAdmin(); brak polityk dla anon/auth
```

### Env (Wojtek ustawia sam na Vercelu)
| Zmienna | Faza |
|---|---|
| `ANTHROPIC_API_KEY` | 2 |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | 3 |
| `POSTPROXY_API_KEY` (ten sam co w `social/.env`) | 4 |
| `RESEND_API_KEY` (już jest) | 5 |

---

## FAZA 1 — feed z Supabase (zlecenia + rejestracje)

**Pliki:** `src/lib/agent/feed.ts`, `src/lib/agent/sources/supabase.ts`, `src/app/api/admin/agent-feed/route.ts`.

1. `buildAgentFeed(): Promise<AgentFeed>` — składa karty ze wszystkich źródeł (na razie tylko Supabase), odfiltrowuje `agent_dismissed`, sortuje priorytet → data.
2. Źródło **zlecenia**: `orders` ze statusem „nowe" bez wpisu w `order_assignments` → `type: "new_order"`, `priority: "high"`.
   - `facts`: klient (imię, e-mail, telefon), usługa/zakres, miasto + kod, pojazd, liczba załączników, wiek zlecenia.
   - Policz aktywne studia (`studios.status='active'`) w tym samym mieście/województwie (użyj `src/lib/studio-location.ts`). Dołóż do faktów: „Aktywne studia w regionie: N (nazwy do 3)".
   - `actions`: `assign_studio` (primary, `payload.studioIds` = do 2 najbliższych), `open` → `/admin/zlecenia/{id}`, `dismiss`.
3. Źródło **rejestracje**: `studios.status='pending'` oraz oczekujące `freelancer_leads` / `landing_leads` (sprawdź, jak auto-onboarding oznacza „oczekuje") → `type: "new_studio"`.
   - `facts`: typ (studio / wrapper mobilny / grafik), usługi, miasto, IG/www, telefon, e-mail, lista PUSTYCH pól profilu.
   - `priority`: `normal`; `low` gdy brak IG i www.
   - `actions`: profil kompletny → `activate_studio` (primary); brak portfolio → `request_info` (primary); zawsze `open` → `/admin/studia/{id}` lub `/admin/leady-freelancer`; `dismiss`.
4. Sugestie w tej fazie **regułowe** (proste zdania z faktów). Faza 2 je zastąpi.
5. `route.ts` GET: `requireAdmin()`, `dynamic = "force-dynamic"`, zwraca `AgentFeed`.
6. `page.tsx`: feed liczony server-side i przekazany jako `initialFeed`. „Odśwież" w `agent-dashboard.tsx` → `fetch('/api/admin/agent-feed')`. Usuń `mock-data.ts`.
7. Ukrywanie karty („Później / Pomiń"): POST `/api/admin/agent-dismiss` → insert do `agent_dismissed`. Przycisk „Pokaż ukryte (N)" u dołu listy przywraca (delete).

**Test:** liczba kart `new_order` = liczba nieprzypisanych zleceń w `/admin/zlecenia`; `new_studio` = liczba oczekujących w `/admin/studia` + leady. Ukryta karta nie wraca po odświeżeniu.

---

## FAZA 2 — Claude API pisze sugestie i projekty odpowiedzi

**Pliki:** `src/lib/agent/suggest.ts`, `src/lib/agent/prompts.ts`. SDK: `@anthropic-ai/sdk`, model `claude-sonnet-4-6`, `max_tokens 600`.

1. Dla każdej karty policz `input_hash = sha256(JSON.stringify(facts))`. Jeśli w `agent_suggestions` jest wpis z tym hashem → użyj z cache. Inaczej wywołaj model i zapisz. Dzięki temu koszt = tylko nowe/zmienione karty.
2. Wywołania równolegle (`Promise.allSettled`), limit 8 naraz. Błąd modelu → karta dostaje sugestię regułową z Fazy 1, nie wywala feedu.
3. Prompt systemowy (w `prompts.ts`, po polsku) — kontekst stały:
   - ZlecOklejanie.pl = darmowy marketplace oklejania (PPF, wrap, branding, grafika); admin = Wojtek; klient nie płaci prowizji; portal przekazuje zlecenie studiom, studia wyceniają w panelu.
   - Zasady treści: po polsku, krótko, konkretnie, bez przymiotnikowych ozdobników; **nigdy nie podawaj cen ani widełek** — kieruj do formularza; nie obiecuj terminów w imieniu studiów; do klientów „Pan/Pani", do wykonawców z IG „ty"; podpis „Wojtek, ZlecOklejanie.pl".
   - Hiline Wrap & Detailing to studio Wojtka — przy zleceniach z Mazowsza może być jedną z propozycji, ale nigdy jedyną.
4. Format odpowiedzi modelu: **tylko JSON** `{ "priority": "high|normal|low", "suggestion": "<1–2 zdania>", "draft": "<treść odpowiedzi lub null>", "primary_action": "<kind>" }`. Parsuj po zdjęciu ``` fences; błąd parsowania = fallback.
5. `draft` trafia do akcji z `kind` w {`request_info`, `reply_email`, `reply_social`}; admin może go edytować w textarea przed wysłaniem (UI już to ma).

**Test:** nowa karta ma sugestię z modelu; drugi refresh nie robi nowego wywołania (sprawdź `agent_suggestions`); po edycji zlecenia w `/admin/zlecenia/{id}` sugestia się odświeża (zmiana hashu).

---

## FAZA 3 — skrzynka Gmail (zlecoklejaniepl@gmail.com)

**Pliki:** `src/lib/agent/sources/gmail.ts`. Biblioteka: `googleapis`.

1. Autoryzacja: OAuth2 „desktop app" w Google Cloud, scope `gmail.readonly` + `gmail.send` (do Fazy 5). Wojtek jednorazowo przechodzi consent i wkleja `GMAIL_REFRESH_TOKEN` do env — przygotuj skrypt `scripts/gmail-auth.mjs`, który wypisuje URL, odbiera kod i drukuje refresh token. **Nie zapisuj tokenu w repo.**
2. Pobierz wątki `is:unread -label:Agent-obsluzone newer_than:14d`. Dla każdego: ostatnia wiadomość (od, temat, data, treść tekstowa do 1500 znaków, threadId).
3. Dopasowanie do bazy: e-mail nadawcy → `profiles.email` / `studios` / `orders.client_email`. Do faktów: „Nadawca w bazie: studio X, status Y" albo „Klient zlecenia #… (miasto, usługa)" albo „Nieznany nadawca".
4. Karta `type: "email"`, `priority`: `high` gdy nadawca jest klientem z otwartym zleceniem lub studiem z pendingiem; inaczej `normal`. Newslettery/automaty (`List-Unsubscribe`, `noreply`) pomijaj.
5. `actions`: `reply_email` (primary, draft z Fazy 2), `open` → `https://mail.google.com/mail/u/0/#inbox/{threadId}`, `dismiss`.
6. Po wysłaniu odpowiedzi (Faza 5) dodaj etykietę `Agent-obsluzone` i oznacz jako przeczytane.

**Test:** wyślij testowy mail na kontakt@zlecoklejanie.pl → po odświeżeniu jest karta; po „Pomiń" znika i nie wraca.

---

## FAZA 4 — komentarze i DM z FB/IG (Postproxy)

**Pliki:** `src/lib/agent/sources/postproxy.ts`. API Postproxy (dokumentacja: to samo, co narzędzia MCP `comments_list`, `dm_chats_list`, `dm_messages_list`, `history_list`), auth `Authorization: Bearer POSTPROXY_API_KEY`.

1. Profile: FB page (grupa `AnF0Ll`, profil `mxUdAk`, page_id `1288058921054739`) i IG @zlecoklejanie (grupa `18F2R7`, profil `wZU3pb`). **Nigdy** profile Hiline.
2. Komentarze: dla postów z ostatnich 30 dni (`history_list`) pobierz `comments_list`; karta dla każdego komentarza bez naszej odpowiedzi i nie od nas. `facts`: autor, treść, tytuł/data posta, reakcje.
3. DM: `dm_chats_list` → nieprzeczytane / ostatnia wiadomość nie od nas → karta z ostatnimi 3 wiadomościami w faktach. Dopasuj handle IG do listy leadów (`freelancer_leads.instagram_url`) — „Jest w bazie leadów: TAK/NIE".
4. `type: "dm_comment"`, `source: "Facebook" | "Instagram"`, `priority`: pytanie zawierające „ile", „cena", „koszt", „gdzie", „jak dołączyć" → `normal`; reszta `low`.
5. `actions`: `reply_social` (primary, draft z Fazy 2), `open` (link do posta/chatu, jeśli API go zwraca), `dismiss`.
6. Rate limit: wynik cache'uj w pamięci procesu na 5 min, żeby refresh nie walił w Postproxy.

**Test:** dodaj komentarz z prywatnego konta pod postem ZlecOklejanie → karta w feedzie z poprawnym źródłem i treścią.

---

## FAZA 5 — przyciski wykonują akcje

**Pliki:** `src/app/api/admin/agent-action/route.ts` (POST), `src/lib/agent/actions.ts`.

Body: `{ cardId, kind, payload }`. Zawsze `requireAdmin()`, log do `admin_actions`, po sukcesie karta znika (insert do `agent_dismissed`) i UI pokazuje toast z tym samym czasownikiem, co przycisk („Przypisano", „Aktywowano", „Wysłano").

| kind | Co robi | Użyj istniejącego |
|---|---|---|
| `assign_studio` | przypisuje `payload.studioIds` do zlecenia + mail „Nowe zlecenie do wyceny" | akcja „Przypisz" z `/admin/zlecenia/[id]` + `notify-assigned.ts` |
| `activate_studio` | `studios.status='active'` (lub tworzy konto z leadu) + mail powitalny | `sendStudioWelcome()` / `auth.admin.createUser` przez ten sam kod co `/admin/studia` |
| `request_info` | mail z `payload.draft` do wykonawcy z `kontakt@zlecoklejanie.pl` (Resend) | helper Resend + `email_log` |
| `reply_email` | odpowiedź w wątku Gmail (`threads.messages.send` z `In-Reply-To`), etykieta `Agent-obsluzone` | gmail.ts |
| `reply_social` | `comments_create` (odpowiedź na komentarz) lub `dm_message_send` (DM) przez Postproxy | postproxy.ts |
| `dismiss` | insert do `agent_dismissed` | — |

Guardy: `assign_studio` odmawia, gdy zlecenie już ma przypisanie; `activate_studio` odmawia, gdy brak e-maila; `reply_*` odmawia przy pustym `draft`. Odmowa = czytelny komunikat w toaście, karta zostaje.

**Test (każdy kind):** klik → efekt w systemie (przypisanie w `/admin/zlecenia/{id}`, konto w Supabase Auth, mail w skrzynce testowej, odpowiedź widoczna pod postem / w DM) → wpis w `admin_actions` → karta zniknęła.

---

## Kolejność i bramki

`F1 → F2 → F3 → F4 → F5`. Każda faza samodzielnie użyteczna. Po F1 i F2 Wojtek ocenia jakość sugestii na prawdziwych danych, zanim pójdą źródła zewnętrzne. F5 ostatnia — dopiero gdy feed jest wiarygodny, przyciski dostają moc.

## Poza zakresem (na razie)
Grupa FB ZlecOklejanie (brak API — dalej ręcznie przez Chrome), autonomiczne działanie bez kliknięcia, powiadomienia push/Telegram.
