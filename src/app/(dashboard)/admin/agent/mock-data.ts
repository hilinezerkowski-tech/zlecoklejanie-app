// Dane pokazowe Fazy 0 — do usunięcia po podłączeniu /api/admin/agent-feed
import type { AgentFeed } from "./types";

const h = (hoursAgo: number) =>
  new Date(Date.now() - hoursAgo * 3600_000).toISOString();

export const MOCK_FEED: AgentFeed = {
  generatedAt: new Date().toISOString(),
  cards: [
    {
      id: "ord-1041",
      type: "new_order",
      priority: "high",
      source: "Supabase",
      occurredAt: h(1.5),
      title: "Renault Master — zmiana koloru na mat, Nowy Dwór Gdański",
      facts: [
        "Klient: Grzegorz Ł., grzegorz@…",
        "Usługa: oklejanie całego auta, folia matowa oliwkowa",
        "Kod pocztowy 82-100 — brak studia w promieniu 30 km",
        "Zdjęcia: 3 załączniki",
      ],
      suggestion:
        "Najbliżej mają Wraphalla PPF (Straszyn, 48 km) i AutoKapi (Malbork, 35 km). Przypisz oba — bus to duże zlecenie, warto dwie wyceny.",
      actions: [
        { kind: "assign_studio", label: "Przypisz Wraphalla + AutoKapi", primary: true },
        { kind: "open", label: "Otwórz zlecenie", href: "/admin/zlecenia/1041" },
        { kind: "dismiss", label: "Później" },
      ],
    },
    {
      id: "lead-88",
      type: "new_studio",
      priority: "normal",
      source: "Supabase",
      occurredAt: h(4),
      title: "AutoDetails Łódź — nowa rejestracja studia",
      facts: [
        "Usługi: PPF, ceramika, przyciemnianie szyb",
        "Instagram: @autodetails.lodz — 2,1 tys. obserwujących, 140 postów",
        "Profil kompletny: adres, telefon, e-mail, opis",
        "Łódź: w bazie są 2 aktywne studia",
      ],
      suggestion:
        "Profil pełny, realne portfolio na IG, miasto z małą konkurencją. Aktywuj konto i wyślij mail powitalny.",
      actions: [
        { kind: "activate_studio", label: "Aktywuj konto", primary: true },
        { kind: "open", label: "Zobacz profil", href: "/admin/studia/88" },
        { kind: "dismiss", label: "Później" },
      ],
    },
    {
      id: "lead-89",
      type: "new_studio",
      priority: "low",
      source: "Supabase",
      occurredAt: h(9),
      title: "Wrapper mobilny — Kamil, Radom",
      facts: [
        "Typ: wrapper bez studia",
        "Instagram: brak linku",
        "Telefon podany, e-mail podany",
        "Promień działania: nie podano",
      ],
      suggestion:
        "Brak portfolio — nie da się ocenić jakości. Poproś o link do Instagrama albo 3 zdjęcia realizacji przed aktywacją.",
      actions: [
        {
          kind: "request_info",
          label: "Poproś o portfolio",
          primary: true,
          draft:
            "Cześć Kamil, dzięki za zgłoszenie do ZlecOklejanie.pl. Żeby dodać Cię do bazy wykonawców, podeślij proszę link do Instagrama albo 3 zdjęcia swoich realizacji. Odpisz na tego maila i aktywuję konto tego samego dnia.",
        },
        { kind: "open", label: "Zobacz zgłoszenie", href: "/admin/leady-freelancer" },
        { kind: "dismiss", label: "Odrzuć" },
      ],
    },
    {
      id: "mail-7f2a",
      type: "email",
      priority: "high",
      source: "Gmail",
      occurredAt: h(2),
      title: "ERES Garage Kraków — pyta o logowanie do panelu",
      facts: [
        "Wątek: „Re: Zaproszenie do ZlecOklejanie.pl”",
        "Cytat: „kliknąłem link i nic się nie dzieje, jak się zalogować?”",
        "Konto w Supabase: istnieje, ostatnie logowanie: nigdy",
        "Magic link wysłany 14.09 — mógł wygasnąć",
      ],
      suggestion:
        "Link wygasł. Wyślij nowy magic link z panelu i odpisz krótko z instrukcją.",
      actions: [
        {
          kind: "reply_email",
          label: "Odpisz + nowy link",
          primary: true,
          draft:
            "Dzień dobry, link z pierwszego maila wygasł — właśnie wysłałem nowy. Proszę kliknąć „Zaloguj się” w najnowszej wiadomości od powiadomienia@zlecoklejanie.pl (ważny 24 h). Gdyby dalej nie działało, proszę o info, sprawdzę od razu.",
        },
        { kind: "open", label: "Otwórz w Gmail", href: "https://mail.google.com/" },
        { kind: "dismiss", label: "Później" },
      ],
    },
    {
      id: "fb-c-5512",
      type: "dm_comment",
      priority: "normal",
      source: "Facebook",
      occurredAt: h(6),
      title: "Komentarz pod postem „4 kroki do wyceny”",
      facts: [
        "Autor: Marek W.",
        "Treść: „ile kosztuje oklejenie BMW e46 na czarny mat?”",
        "Post: 22.09, 14 reakcji, 3 komentarze",
      ],
      suggestion:
        "Pytanie o cenę — nie podawaj widełek publicznie, skieruj do formularza. Odpowiedź ma być krótka i zapraszająca.",
      actions: [
        {
          kind: "reply_social",
          label: "Odpowiedz",
          primary: true,
          draft:
            "Cześć Marek! Zależy od folii i stanu lakieru — wyślij zgłoszenie na zlecoklejanie.pl, dostaniesz wyceny od studiów z Twojej okolicy w 24 h, bez zobowiązań 👍",
        },
        { kind: "dismiss", label: "Pomiń" },
      ],
    },
    {
      id: "ig-dm-301",
      type: "dm_comment",
      priority: "low",
      source: "Instagram",
      occurredAt: h(20),
      title: "DM od @foxy_wrapping",
      facts: [
        "Treść: „hej, czy mogę dołączyć jako mobilny? nie mam warsztatu”",
        "Konto: 3,4 tys. obserwujących, realizacje PPF i wrap",
        "W bazie leadów: TAK — dodany 17.09 (Żuławy), niekontaktowany",
      ],
      suggestion:
        "Jest już na liście freelancerów z dobrym portfolio. Odpisz z linkiem do formularza wrappera mobilnego.",
      actions: [
        {
          kind: "reply_social",
          label: "Odpowiedz",
          primary: true,
          draft:
            "Hej! Jasne, mamy osobne konto dla wrapperów bez studia. Rejestracja tutaj: zlecoklejanie.pl/dolacz — podaj Instagram jako portfolio i aktywuję konto tego samego dnia.",
        },
        { kind: "dismiss", label: "Pomiń" },
      ],
    },
  ],
};
