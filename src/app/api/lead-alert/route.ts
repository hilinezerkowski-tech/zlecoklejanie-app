import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  APP_URL,
  SITE_URL,
  emailLayout,
  escapeHtml,
  isValidEmail,
  sendEmail,
} from "@/lib/email";

/**
 * Obsluga nowego leada z landing page — dwa maile:
 *  1. ALERT do admina (pelna tresc zgloszenia + link do skrzynki leadow),
 *  2. AUTORESPONDER do zglaszajacego (potwierdzenie, ze zgloszenie dotarlo).
 *
 * Wolany przez trigger PostgreSQL (pg_net) na INSERT do landing_leads.
 * Payload: { type: "INSERT", table: "landing_leads", record: {...} }
 * Akceptujemy tez { leadId: "..." } do recznego wyzwolenia.
 *
 * BEZPIECZENSTWO — endpoint jest publiczny (trigger nie wysyla naglowkow
 * autoryzacyjnych), wiec zamiast sekretu ograniczamy to, co da sie nim zrobic:
 *  - adres admina jest STALY, nie pochodzi z requestu,
 *  - tresc i adres zglaszajacego pochodza WYLACZNIE z bazy, po ID —
 *    caller podaje tylko identyfikator, nie da sie wstrzyknac tekstu ani adresu,
 *  - wysylamy tylko dla leada o statusie 'new' i mlodszego niz 10 minut,
 *    wiec nie da sie odpalac powiadomien w kolko dla starych rekordow.
 * Najgorszy scenariusz naduzycia: jednorazowy mail o realnym, swiezym leadzie.
 */

// UWAGA: kontakt@zlecoklejanie.pl NIE ma skrzynki odbiorczej — rekord MX domeny
// obsluguje tylko bounce z Resend przy wysylce. Alerty ida na adres, ktory
// realnie czytamy. Mozna nadpisac zmienna ADMIN_ALERT_EMAIL w Vercelu.
const ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL || "zlecoklejaniepl@gmail.com";

const MAX_AGE_MS = 10 * 60 * 1000;

const kindLabels: Record<string, string> = {
  zlecenie: "klient szuka wykonawcy",
  studio: "studio chce dolaczyc",
  grafik: "grafik chce dolaczyc",
};

const fieldLabels: Record<string, string> = {
  usluga: "Usluga",
  auto: "Auto",
  miasto: "Miasto",
  szczegoly: "Szczegoly",
  potrzebuje_grafika: "Potrzebuje grafika",
  nazwa: "Nazwa",
  instagram: "Instagram",
  portfolio: "Portfolio",
  specjalizacja: "Specjalizacja",
  email: "E-mail",
  telefon: "Telefon",
};

/**
 * Tresc autorespondera zalezna od typu zgloszenia.
 * `name` jest juz zescapowany przez wolajacego.
 */
function autoReply(kind: string, name: string) {
  const hello = name ? `Cześć ${name},` : "Cześć,";

  if (kind === "studio") {
    return {
      subject: "Zgłoszenie studia przyjęte — ZlecOklejanie.pl",
      title: "Mamy Twoje zgłoszenie",
      body: `<p>${hello}</p>
        <p>Dziękujemy za chęć dołączenia do ZlecOklejanie.pl. Zgłoszenie trafiło do nas i sprawdzamy je ręcznie — <strong>odezwiemy się w ciągu 24 godzin</strong> z dostępem do panelu.</p>
        <p><strong>Co dostajesz:</strong></p>
        <ul style="padding-left:18px;margin:8px 0;">
          <li>Dostęp do zapytań jest <strong>całkowicie bezpłatny</strong> — nie płacisz za kontakt ani za leada.</li>
          <li>Każde zlecenie trafia do <strong>maksymalnie 3 studiów</strong>, nie do kilkunastu naraz.</li>
          <li>Zapytania przechodzą przez branżowy formularz — wiesz co, na czym i w jakim zakresie, zanim odpiszesz.</li>
          <li>Wyceniasz tylko to, co Ci pasuje. Reszta Cię nie obchodzi.</li>
        </ul>
        <p>Jeśli chcesz coś dopowiedzieć o swoim studiu — po prostu odpisz na tego maila.</p>`,
      ctaUrl: SITE_URL,
      ctaLabel: "Zobacz, jak to działa",
      footer:
        "Ten e-mail wysłano automatycznie po wypełnieniu formularza na zlecoklejanie.pl. Jeśli to nie Ty — zignoruj tę wiadomość.",
    };
  }

  if (kind === "grafik") {
    return {
      subject: "Zgłoszenie grafika przyjęte — ZlecOklejanie.pl",
      title: "Mamy Twoje zgłoszenie",
      body: `<p>${hello}</p>
        <p>Dziękujemy za zgłoszenie do sekcji dla grafików. Przejrzymy Twoje portfolio i <strong>odezwiemy się w ciągu 24 godzin</strong>.</p>
        <p>Każde oklejenie zaczyna się od projektu — a klienci na rynku szukają grafika osobno i po omacku. Dlatego zbieramy grafików ogarniających rozkładówki na auta i podpinamy ich pod realne zlecenia.</p>
        <p>Jeśli masz linki do prac, których nie było w formularzu — odpisz na tego maila.</p>`,
      ctaUrl: SITE_URL,
      ctaLabel: "Zobacz, jak to działa",
      footer:
        "Ten e-mail wysłano automatycznie po wypełnieniu formularza na zlecoklejanie.pl. Jeśli to nie Ty — zignoruj tę wiadomość.",
    };
  }

  // Domyslnie: klient szukajacy wykonawcy
  return {
    subject: "Przyjęliśmy Twoje zapytanie — ZlecOklejanie.pl",
    title: "Zapytanie przyjęte",
    body: `<p>${hello}</p>
      <p>Dostaliśmy Twoje zapytanie i już dobieramy do niego wykonawców.</p>
      <p><strong>Co się teraz stanie:</strong></p>
      <ul style="padding-left:18px;margin:8px 0;">
        <li>Wybieramy <strong>maksymalnie 3 studia</strong> pasujące do zakresu i lokalizacji.</li>
        <li>Odezwiemy się w ciągu 24 godzin — telefonicznie lub mailem.</li>
        <li><strong>Nie płacisz nic</strong> za kontakt ani za wycenę. Decyzja zawsze po Twojej stronie.</li>
      </ul>
      <p>Jeśli chcesz dorzucić zdjęcia auta albo projekt — odpisz na tego maila, trafi to prosto do nas.</p>`,
    ctaUrl: SITE_URL,
    ctaLabel: "Wróć na stronę",
    footer:
      "Ten e-mail wysłano automatycznie po wypełnieniu formularza na zlecoklejanie.pl. Jeśli to nie Ty — zignoruj tę wiadomość.",
  };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const b = (body || {}) as { record?: { id?: string }; leadId?: string };
  const leadId = b.record?.id || b.leadId;
  if (!leadId) {
    return NextResponse.json({ error: "no lead id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("landing_leads")
    .select("id, kind, payload, status, created_at")
    .eq("id", leadId)
    .single();

  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Anty-naduzycie: tylko swieze, nieobsluzone leady.
  if (lead.status !== "new") {
    return NextResponse.json({ ok: true, skipped: "not new" });
  }
  if (Date.now() - new Date(lead.created_at).getTime() > MAX_AGE_MS) {
    return NextResponse.json({ ok: true, skipped: "too old" });
  }

  const p = (lead.payload || {}) as Record<string, string>;
  const leadEmail = isValidEmail(p.email) ? p.email.trim() : null;

  // ---- 1. Alert do admina ----------------------------------------------
  const rows = Object.entries(p)
    .filter(([, v]) => v && String(v).trim())
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;vertical-align:top;">${escapeHtml(
          fieldLabels[k] || k
        )}</td><td style="padding:4px 0;"><strong>${escapeHtml(
          String(v)
        )}</strong></td></tr>`
    )
    .join("");

  const kindLabel = kindLabels[lead.kind] || lead.kind;
  const adminSubject =
    `Nowy lead (${lead.kind}): ${p.nazwa || p.auto || p.miasto || p.email || ""}`.trim();

  const adminHtml = emailLayout({
    title: "Nowe zgloszenie z formularza",
    body: `<p style="font-size:14px;color:#666;margin:0 0 16px;">Typ: ${escapeHtml(
      kindLabel
    )}</p>
      <table style="font-size:14px;line-height:1.5;border-collapse:collapse;">${rows}</table>`,
    ctaUrl: `${APP_URL}/admin/leady?status=new`,
    ctaLabel: "Otworz skrzynke leadow",
    footer:
      "Lead klienta zamienisz na zlecenie jednym kliknieciem w panelu. Zglaszajacy dostal juz automatyczne potwierdzenie.",
  });

  // replyTo: odpisujesz prosto do zglaszajacego z poziomu swojej skrzynki.
  const adminSent = await sendEmail(
    ADMIN_EMAIL,
    adminSubject,
    adminHtml,
    leadEmail ? { replyTo: leadEmail } : undefined
  );

  // ---- 2. Autoresponder do zglaszajacego --------------------------------
  // Adres pochodzi z bazy (rekord wstawiony przez formularz), nie z requestu.
  let replySent = false;
  if (leadEmail) {
    const name = escapeHtml((p.nazwa || "").trim().split(/\s+/)[0] || "");
    const tpl = autoReply(lead.kind, name);
    replySent = await sendEmail(
      leadEmail,
      tpl.subject,
      emailLayout({
        title: tpl.title,
        body: tpl.body,
        ctaUrl: tpl.ctaUrl,
        ctaLabel: tpl.ctaLabel,
        footer: tpl.footer,
      }),
      { replyTo: ADMIN_EMAIL }
    );
  }

  return NextResponse.json({ ok: true, adminSent, replySent });
}
