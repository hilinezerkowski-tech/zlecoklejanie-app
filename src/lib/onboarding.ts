/**
 * Automatyczny onboarding wykonawcy prosto z leada (formularz na landingu).
 *
 * PROBLEM: konto studia/grafika powstawało dopiero, gdy admin kliknął
 * „Zamień na studio" w /admin/leady. W praktyce welcome mail wychodził po
 * 4–22 h, a połowa zgłoszonych nigdy się nie logowała.
 *
 * ROZWIĄZANIE: /api/lead-alert woła tę funkcję dla leadów `studio` i `grafik`.
 * Konto powstaje od razu, ale ze statusem `pending` — wykonawca może się
 * zalogować i uzupełnić profil, a zlecenia dostaje dopiero po ręcznej
 * aktywacji przez admina (/admin/studia?status=pending → „Aktywuj").
 * Lista przypisań w zleceniu filtruje po status='active', więc konto
 * oczekujące nie dostanie żadnego zapytania.
 *
 * BEZPIECZEŃSTWO (endpoint wołający jest publiczny):
 *  - dane pochodzą WYŁĄCZNIE z rekordu w bazie, nie z requestu,
 *  - istniejącego konta (dowolna rola) NIE dotykamy — wtedy zostaje ścieżka ręczna,
 *  - dzienny limit automatycznych kont (DAILY_CAP) — powyżej zostaje ścieżka ręczna,
 *  - najgorszy scenariusz nadużycia: jeden mail z linkiem logowania na wpisany
 *    adres; to ten sam poziom co dotychczasowy autoresponder.
 *
 * Plik NIE ma dyrektywy "use server" celowo — to zwykły moduł serwerowy,
 * nie może być wołany z przeglądarki jako Server Action.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL, emailLayout, escapeHtml, isValidEmail, sendEmail } from "@/lib/email";
import { adresZKodem } from "@/lib/kod-pocztowy";

type AdminClient = ReturnType<typeof createAdminClient>;

export type AutoOnboardResult = {
  done: boolean;
  kind?: "studio" | "grafik";
  welcomeSent?: boolean;
  /** Powód pominięcia — trafia do maila z alertem dla admina. */
  reason?: string;
};

type LeadRow = {
  id: string;
  kind: string;
  payload: unknown;
};

/** Maksymalna liczba automatycznie założonych kont na 24 h. */
const DAILY_CAP = 10;

const AUTO_EVENTS = ["studio_welcome_auto", "designer_welcome_auto"];

/** Checkboxy „Co robisz?" z formularza wykonawcy → specjalizacje w profilu. */
const SERVICE_LABELS: Record<string, string> = {
  usl_wrap: "zmiana koloru / wrap",
  usl_ppf: "PPF",
  usl_reklama: "oklejanie reklamowe / floty",
  usl_szyby: "przyciemnianie szyb",
  usl_mobilnie: "dojazd do klienta",
};

/**
 * Pole formularza to „Instagram lub strona WWW" — rozdzielamy je na dwie kolumny.
 * Link do instagram.com i „@nick" to Instagram; coś z domeną lub ukośnikiem to WWW;
 * goły nick bez kropki-domeny to Instagram.
 */
function splitPortfolio(raw: string | undefined): {
  instagram: string | null;
  website: string | null;
} {
  const v = (raw || "").trim();
  if (!v) return { instagram: null, website: null };

  const ig = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (ig) return { instagram: ig[1], website: null };
  if (v.startsWith("@")) return { instagram: v.slice(1).trim() || null, website: null };

  const looksLikeUrl = /\s|\/|^www\./i.test(v) || /\.[a-z]{2,}$/i.test(v);
  if (looksLikeUrl) {
    const first = v.split(/\s+/)[0];
    return { instagram: null, website: /^https?:\/\//i.test(first) ? first : `https://${first}` };
  }
  return { instagram: v, website: null };
}

/** Jednorazowy link logowania; przy błędzie zwykły adres /login. */
async function loginLink(admin: AdminClient, email: string, next: string): Promise<string> {
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const hashedToken = data?.properties?.hashed_token;
    if (!error && hashedToken) {
      return (
        `${APP_URL}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}` +
        `&type=magiclink&next=${encodeURIComponent(next)}`
      );
    }
    if (error) console.warn("[auto-onboard] generateLink failed:", error.message);
  } catch (e) {
    console.warn("[auto-onboard] generateLink threw:", e);
  }
  return `${APP_URL}/login`;
}

const WELCOME_FOOTER =
  "Link logowania jest jednorazowy i wygasa po godzinie. Jeśli przestanie działać — wejdź na " +
  `${APP_URL}/login, podaj ten adres e-mail, a wyślemy nowy. Ten e-mail wysłano po wypełnieniu ` +
  "formularza na zlecoklejanie.pl. Jeśli to nie Ty — zignoruj tę wiadomość. Masz pytania? Odpisz na tego maila.";

export async function autoOnboardLead(
  admin: AdminClient,
  lead: LeadRow
): Promise<AutoOnboardResult> {
  if (lead.kind !== "studio" && lead.kind !== "grafik") return { done: false };
  const kind = lead.kind;

  const p = (lead.payload || {}) as Record<string, string>;
  const email = isValidEmail(p.email) ? p.email.trim().toLowerCase() : "";
  const name = (p.nazwa || p.imie || "").trim();
  if (!email || !name) return { done: false, kind, reason: "brak poprawnego e-maila lub nazwy" };

  const portfolioRaw = (p.portfolio || p.portfolio_url || p.link || "").trim();
  if (kind === "grafik" && !portfolioRaw) {
    return { done: false, kind, reason: "grafik bez linku do portfolio" };
  }

  // Istniejącego konta nie ruszamy — ani admina, ani klienta, ani wykonawcy.
  const { data: existing } = await admin
    .from("profiles")
    .select("id, role")
    .eq("email", email)
    .maybeSingle();
  if (existing?.id) {
    return { done: false, kind, reason: `konto ${email} już istnieje (rola: ${existing.role})` };
  }

  // Dzienny limit — liczymy po historii maili, bez nowej tabeli.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .in("event", AUTO_EVENTS)
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_CAP) {
    return { done: false, kind, reason: `dzienny limit ${DAILY_CAP} automatycznych kont` };
  }

  const role = kind === "studio" ? "studio" : "designer";
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { role },
  });
  const userId = created?.user?.id;
  if (createErr || !userId) {
    return { done: false, kind, reason: `createUser: ${createErr?.message ?? "brak ID"}` };
  }

  await admin
    .from("profiles")
    .update({ role, phone: p.telefon?.trim() || null })
    .eq("id", userId);

  if (kind === "studio") {
    const { instagram, website } = splitPortfolio(p.instagram);
    const specializations = Object.keys(SERVICE_LABELS)
      .filter((k) => p[k])
      .map((k) => SERVICE_LABELS[k]);

    const { error: studioErr } = await admin.from("studios").upsert(
      {
        id: userId,
        business_name: name,
        address: adresZKodem(p.miasto, p.kod_pocztowy) || null,
        instagram,
        website,
        specializations,
        status: "pending",
      },
      { onConflict: "id" }
    );
    if (studioErr) return { done: false, kind, reason: `studios: ${studioErr.message}` };

    const url = await loginLink(admin, email, "/studio/profil");
    const welcomeSent = await sendEmail(
      email,
      "Twoje konto na ZlecOklejanie.pl — uzupełnij profil",
      emailLayout({
        title: "Konto założone — został profil",
        body: `<p>Cześć,</p>
<p>Dziękujemy za zgłoszenie. Konto dla <strong>${escapeHtml(name)}</strong> już istnieje — kliknij poniżej, wejdziesz prosto do panelu, bez hasła.</p>
<p><strong>Zrób teraz dwie rzeczy:</strong></p>
<ul style="padding-left:18px;margin:8px 0;">
<li><strong>Uzupełnij profil</strong> — opis, specjalizacje, marki folii i zdjęcia realizacji. To widzi klient przy porównywaniu wycen.</li>
<li><strong>Ustaw promień działania</strong> — dzięki temu dostajesz tylko zapytania z zasięgu.</li>
</ul>
<p><strong>Co dalej:</strong> każde zgłoszenie sprawdzamy ręcznie — oglądamy portfolio. Po weryfikacji aktywujemy konto i zaczynasz dostawać zapytania z okolicy, zwykle w ciągu 24 godzin. Im pełniejszy profil, tym szybciej.</p>
<p>Zasady: <strong>zero opłat</strong> za dostęp i za kontakt, a każde zlecenie trafia do <strong>maksymalnie 3 wykonawców</strong>. Wyceniasz tylko to, co Ci pasuje.</p>`,
        ctaUrl: url,
        ctaLabel: "Wejdź do panelu",
        footer: WELCOME_FOOTER,
      }),
      { log: { event: "studio_welcome_auto", recipientRole: "studio", leadId: lead.id } }
    );
    return { done: true, kind, welcomeSent };
  }

  // ---- grafik ----
  const { instagram } = splitPortfolio(p.instagram);
  const { error: designerErr } = await admin.from("designers").upsert(
    {
      id: userId,
      display_name: name,
      city: p.miasto?.trim() || null,
      portfolio_url: portfolioRaw,
      instagram,
      specializations: p.specjalizacja ? [p.specjalizacja.trim()] : [],
      status: "pending",
    },
    { onConflict: "id" }
  );
  if (designerErr) return { done: false, kind, reason: `designers: ${designerErr.message}` };

  const url = await loginLink(admin, email, "/grafik/profil");
  const welcomeSent = await sendEmail(
    email,
    "Twoje konto grafika na ZlecOklejanie.pl — uzupełnij profil",
    emailLayout({
      title: "Konto założone — został profil",
      body: `<p>Cześć,</p>
<p>Dziękujemy za zgłoszenie. Konto dla <strong>${escapeHtml(name)}</strong> już istnieje — kliknij poniżej, wejdziesz prosto do panelu, bez hasła.</p>
<p><strong>Zrób teraz trzy rzeczy:</strong></p>
<ul style="padding-left:18px;margin:8px 0;">
<li><strong>Sprawdź link do portfolio</strong> — bez prac nie kierujemy do Ciebie zapytań.</li>
<li><strong>Zaznacz, czy pracujesz na szablonach pojazdów</strong> — to decyduje, jakie projekty dostajesz.</li>
<li><strong>Ustaw widełki i miesięczną przepustowość</strong> — nie zasypiemy Cię zapytaniami, których nie obsłużysz.</li>
</ul>
<p><strong>Co dalej:</strong> każde zgłoszenie sprawdzamy ręcznie — oglądamy portfolio. Po weryfikacji aktywujemy konto, zwykle w ciągu 24 godzin.</p>
<p>Zasady: <strong>zero opłat</strong> za dostęp i za kontakt, a każde zapytanie trafia do <strong>maksymalnie 3 grafików</strong>.</p>`,
      ctaUrl: url,
      ctaLabel: "Wejdź do panelu",
      footer: WELCOME_FOOTER,
    }),
    { log: { event: "designer_welcome_auto", recipientRole: "designer", leadId: lead.id } }
  );
  return { done: true, kind, welcomeSent };
}
