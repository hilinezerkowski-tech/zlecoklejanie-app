import type { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL, emailLayout, escapeHtml, sendEmail } from "@/lib/email";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Mail powitalny dla grafika — z jednorazowym linkiem logowania.
 *
 * Ten sam mechanizm co przy studiach: konto zaklada admin przez
 * `auth.admin.createUser`, wiec Supabase nie wysyla nic z automatu.
 * Bez tego maila grafik ma konto, o ktorym nie wie.
 *
 * Wolane przy dodaniu grafika w /admin/graficy i przy aktywacji z panelu agenta.
 * Modul bez "use server" — to nie moze byc Server Action wolana z przegladarki.
 */
export async function sendDesignerWelcome(
  admin: AdminClient,
  email: string,
  displayName: string
): Promise<boolean> {
  let loginUrl = `${APP_URL}/login`;

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const hashedToken = data?.properties?.hashed_token;
    if (!error && hashedToken) {
      loginUrl =
        `${APP_URL}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}` +
        `&type=magiclink&next=${encodeURIComponent("/grafik/profil")}`;
    } else if (error) {
      console.warn("[createDesigner] generateLink failed:", error.message);
    }
  } catch (e) {
    console.warn("[createDesigner] generateLink threw:", e);
  }

  const name = escapeHtml(displayName);

  return sendEmail(
    email,
    "Twoje konto grafika na ZlecOklejanie.pl jest gotowe",
    emailLayout({
      title: "Konto grafika aktywne",
      body: `<p>Cześć,</p>
        <p>Konto dla <strong>${name}</strong> jest już aktywne. Kliknij poniżej — wejdziesz prosto do panelu, bez hasła.</p>
        <p><strong>Dlaczego w ogóle jesteś na tej liście:</strong> większość studiów oklejających nie ma własnego grafika. Klient przychodzi z pomysłem i pustym plikiem, a studio potrafi tylko wydrukować i nakleić. Ty wypełniasz tę lukę.</p>
        <p><strong>Zacznij od trzech rzeczy:</strong></p>
        <ul style="padding-left:18px;margin:8px 0;">
          <li><strong>Wklej portfolio</strong> — bez linku do prac nie kierujemy do Ciebie briefów.</li>
          <li><strong>Zaznacz, czy pracujesz na szablonach pojazdów</strong> — to pytanie dzieli rynek na pół i decyduje, jakie briefy dostajesz.</li>
          <li><strong>Ustaw widełki i miesięczną przepustowość</strong> — nie zasypiemy Cię zapytaniami, których nie obsłużysz.</li>
        </ul>
        <p>Zasady: <strong>zero opłat</strong> za dostęp i za kontakt, a każdy brief trafia do <strong>maksymalnie 3 grafików</strong>.</p>`,
      ctaUrl: loginUrl,
      ctaLabel: "Wejdź do panelu",
      footer:
        "Link logowania jest jednorazowy i wygasa po godzinie. Jeśli przestanie działać — wejdź na " +
        `${APP_URL}/login, podaj ten adres e-mail, a wyślemy nowy. Masz pytania? Odpisz na tę wiadomość.`,
    }),
    { log: { event: "designer_welcome", recipientRole: "designer" } }
  );
}
