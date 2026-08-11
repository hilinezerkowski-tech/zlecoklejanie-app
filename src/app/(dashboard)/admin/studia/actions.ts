"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { APP_URL, emailLayout, escapeHtml, sendEmail } from "@/lib/email";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Mail powitalny dla nowo utworzonego studia — z jednorazowym linkiem
 * logowania.
 *
 * Dlaczego tak: konto zakłada admin (`auth.admin.createUser`), więc studio
 * NIE dostaje z Supabase żadnej wiadomości. Bez tego maila konto istnieje,
 * a właściciel studia nawet nie wie, że ma dostęp — i trzeba do niego dzwonić.
 *
 * `generateLink` zwraca `hashed_token`, który wymieniamy na sesję we własnej
 * trasie /auth/confirm. Link wygasa (domyślnie ~1h), dlatego w stopce jest
 * jasna instrukcja: wejdź na /login i poproś o świeży.
 *
 * Błąd wysyłki NIE przerywa tworzenia studia — konto ma powstać tak czy siak.
 */
async function sendStudioWelcome(
  admin: AdminClient,
  email: string,
  businessName: string
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
      console.warn("[createStudio] generateLink failed:", error.message);
    }
  } catch (e) {
    console.warn("[createStudio] generateLink threw:", e);
  }

  const name = escapeHtml(businessName);

  return sendEmail(
    email,
    "Twoje konto na ZlecOklejanie.pl jest gotowe",
    emailLayout({
      title: "Konto studia aktywne",
      body: `<p>Cześć,</p>
        <p>Konto dla <strong>${name}</strong> jest już aktywne. Kliknij poniżej — wejdziesz prosto do panelu, bez hasła.</p>
        <p><strong>Zacznij od trzech rzeczy:</strong></p>
        <ul style="padding-left:18px;margin:8px 0;">
          <li><strong>Uzupełnij profil</strong> — opis, specjalizacje, marki folii, Instagram. To widzi klient przy porównywaniu wycen.</li>
          <li><strong>Ustaw promień działania</strong> — dzięki temu dostajesz tylko zapytania z zasięgu.</li>
          <li><strong>Sprawdzaj zakładkę Zlecenia</strong> — powiadomienie o nowym zapytaniu przychodzi mailem.</li>
        </ul>
        <p>Przypominam zasady: <strong>zero opłat</strong> za dostęp i za kontakt, a każde zlecenie trafia do <strong>maksymalnie 3 studiów</strong>. Wyceniasz tylko to, co Ci pasuje.</p>`,
      ctaUrl: loginUrl,
      ctaLabel: "Wejdź do panelu",
      footer:
        "Link logowania jest jednorazowy i wygasa po godzinie. Jeśli przestanie działać — wejdź na " +
        `${APP_URL}/login, podaj ten adres e-mail, a wyślemy nowy. Masz pytania? Odpisz na tę wiadomość.`,
    })
  );
}

export type CreateStudioInput = {
  email: string;
  business_name: string;
  address?: string;
  instagram?: string;
  phone?: string;
  nip?: string;
  specializations?: string;
};

export type CreateStudioResult = {
  ok: boolean;
  error?: string;
  message?: string;
};

/**
 * Tworzy (lub promuje istniejące) konto studia i aktywuje je.
 *
 * Dlaczego Server Action + service role: `auth.admin.createUser` wymaga klucza
 * service role, którego NIGDY nie wolno wystawić w przeglądarce. Poprzednia
 * wersja wołała to z komponentu klienckiego kluczem anon → zawsze błąd.
 */
export async function createStudio(
  input: CreateStudioInput
): Promise<CreateStudioResult> {
  // 1. Kontrola uprawnień — tylko admin. Sprawdzamy WŁASNY profil (auth.uid()=id),
  //    więc nie dotykamy rekurencyjnej polityki RLS dla admina.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Brak sesji." };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") {
    return { ok: false, error: "Brak uprawnień (tylko admin)." };
  }

  const email = input.email.trim().toLowerCase();
  const businessName = input.business_name.trim();
  if (!email || !businessName) {
    return { ok: false, error: "Email i nazwa firmy są wymagane." };
  }

  const admin = createAdminClient();

  // Zabezpieczenie: NIGDY nie degradujemy konta admina.
  // Bez tego dodanie studia na adres admina nadpisuje role='admin'
  // i operator traci dostep do panelu — cicho, bez zadnego ostrzezenia.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile?.role === "admin") {
    return {
      ok: false,
      error:
        "Ten e-mail należy do konta administratora. Użyj innego adresu — " +
        "inaczej stracisz dostęp do panelu.",
    };
  }
  let userId: string | undefined;

  // 2. Utwórz konto auth (bez hasła — logowanie magic-linkiem). Rola 'studio'
  //    ustawia się sama przez trigger handle_new_user (czyta ją z metadanych).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { role: "studio" },
  });

  if (createErr) {
    // Najczęstszy przypadek: email już istnieje (np. wcześniejszy lead).
    // Wtedy promujemy istniejący profil na studio zamiast zwracać błąd.
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing?.id) {
      userId = existing.id;
    } else {
      return { ok: false, error: `Nie udało się utworzyć konta: ${createErr.message}` };
    }
  } else {
    userId = created.user?.id;
  }

  if (!userId) {
    return { ok: false, error: "Nie udało się uzyskać ID użytkownika." };
  }

  // 3. Upewnij się, że profil ma rolę 'studio' i telefon (service role omija RLS).
  await admin
    .from("profiles")
    .update({ role: "studio", phone: input.phone?.trim() || null })
    .eq("id", userId);

  // 4. Utwórz/aktualizuj rekord studia — od razu aktywne (dodane przez admina).
  const specializations = (input.specializations || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { error: studioErr } = await admin.from("studios").upsert(
    {
      id: userId,
      business_name: businessName,
      address: input.address?.trim() || null,
      instagram: input.instagram?.replace("@", "").trim() || null,
      nip: input.nip?.trim() || null,
      specializations,
      status: "active",
    },
    { onConflict: "id" }
  );

  if (studioErr) {
    return { ok: false, error: `Błąd tworzenia studia: ${studioErr.message}` };
  }

  // 5. Mail powitalny z linkiem logowania. Nie blokuje sukcesu operacji —
  //    jeśli wysyłka padnie, admin zobaczy to w komunikacie i zadzwoni.
  const welcomeSent = await sendStudioWelcome(admin, email, businessName);

  revalidatePath("/admin/studia");
  return {
    ok: true,
    message:
      `Studio „${businessName}" dodane i aktywowane. ` +
      (welcomeSent
        ? `Mail powitalny z linkiem logowania wysłany na ${email}.`
        : `UWAGA: nie udało się wysłać maila powitalnego na ${email} — skontaktuj się ze studiem ręcznie.`),
  };
}
