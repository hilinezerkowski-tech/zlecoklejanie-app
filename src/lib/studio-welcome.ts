import type { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL, emailLayout, escapeHtml, sendEmail } from "@/lib/email";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Mail powitalny dla aktywowanego studia / wrappera — z jednorazowym linkiem
 * logowania.
 *
 * Dlaczego tak: konto zakłada admin (`auth.admin.createUser`) albo auto-onboarding,
 * więc studio NIE dostaje z Supabase żadnej wiadomości o aktywacji. Bez tego maila
 * konto działa, a właściciel studia nawet nie wie, że może wyceniać.
 *
 * `generateLink` zwraca `hashed_token`, który wymieniamy na sesję we własnej
 * trasie /auth/confirm. Link wygasa (domyślnie ~1h), dlatego w stopce jest
 * jasna instrukcja: wejdź na /login i poproś o świeży.
 *
 * Moduł bez "use server" — to nie może być Server Action wołana z przeglądarki.
 */
export async function sendStudioWelcome(
  admin: AdminClient,
  email: string,
  businessName: string,
  providerType: string = "studio"
): Promise<boolean> {
  let loginUrl = `${APP_URL}/login`;

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const hashedToken = data?.properties?.hashed_token;
    if (!error && hashedToken) {
      // next=/studio/profil — pierwsze, co studio powinno zrobić, to uzupełnić
      // profil, bo to on decyduje o wyborze przy porównaniu wycen.
      loginUrl =
        `${APP_URL}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}` +
        `&type=magiclink&next=${encodeURIComponent("/studio/profil")}`;
    } else if (error) {
      console.warn("[studio-welcome] generateLink failed:", error.message);
    }
  } catch (e) {
    console.warn("[studio-welcome] generateLink threw:", e);
  }

  const name = escapeHtml(businessName);
  const isFreelancer = providerType === "freelancer";

  const subject = "Twoje konto na ZlecOklejanie.pl jest gotowe";

  const studioBody = `<p>Cześć,</p>
        <p>Konto dla <strong>${name}</strong> jest już aktywne. Kliknij poniżej — wejdziesz prosto do panelu, bez hasła.</p>
        <p><strong>Zacznij od tego:</strong></p>
        <ul style="padding-left:18px;margin:8px 0;">
          <li><strong>Zaznacz swoje usługi</strong> — po nich dobieramy zlecenia. Bez tego nie dostaniesz żadnego zapytania.</li>
          <li><strong>Uzupełnij profil</strong> — opis, marki folii, Instagram. To widzi klient przy porównywaniu wycen.</li>
          <li><strong>Ustaw promień działania</strong> — dzięki temu dostajesz tylko zapytania z zasięgu.</li>
          <li><strong>Sprawdzaj zakładkę Zlecenia</strong> — powiadomienie o nowym zapytaniu przychodzi mailem.</li>
        </ul>
        <p>Przypominam zasady: <strong>zero opłat</strong> za dostęp i za kontakt, a każde zlecenie trafia do <strong>maksymalnie 3 studiów</strong>. Wyceniasz tylko to, co Ci pasuje.</p>`;

  const freelancerBody = `<p>Hej ${name},</p>
        <p>Konto aktywne — możesz zaczynać. Kliknij poniżej, wejdziesz do panelu bez wpisywania hasła.</p>
        <p><strong>Kilka rzeczy na start:</strong></p>
        <ul style="padding-left:18px;margin:8px 0;">
          <li><strong>Zaznacz swoje usługi</strong> — po nich dobieramy zlecenia. Bez tego nie dostaniesz żadnego zapytania.</li>
          <li><strong>Uzupełnij profil</strong> — opis, marki folii, które znasz, i oczywiście link do IG. Klienci porównują i to Twoje IG robi robotę.</li>
          <li><strong>Podaj zasięg</strong> — gdzie dojeżdżasz? Dzięki temu dostaniesz tylko zapytania, które mają sens geograficznie.</li>
          <li><strong>Pilnuj zakładki Zlecenia</strong> — jak coś wpłynie, dostaniesz maila.</li>
        </ul>
        <p>Zasady: <strong>zero opłat</strong> za konto i kontakt z klientem, każde zlecenie idzie do <strong>max 3 wykonawców</strong>. Wyceniasz tylko to, na co masz ochotę i czas.</p>
        <p>Jak masz pytania — odpisz na tego maila, trafia prosto do mnie.</p>`;

  return sendEmail(
    email,
    subject,
    emailLayout({
      title: isFreelancer ? "Konto aktywne — witaj w ZlecOklejanie!" : "Konto studia aktywne",
      body: isFreelancer ? freelancerBody : studioBody,
      ctaUrl: loginUrl,
      ctaLabel: "Wejdź do panelu",
      footer:
        "Link logowania jest jednorazowy i wygasa po godzinie. Jeśli przestanie działać — wejdź na " +
        `${APP_URL}/login, podaj ten adres e-mail, a wyślemy nowy. Masz pytania? Odpisz na tę wiadomość.`,
    }),
    { log: { event: isFreelancer ? "freelancer_welcome" : "studio_welcome", recipientRole: "studio" } }
  );
}
