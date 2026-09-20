"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  APP_URL,
  EMAIL_FROM_KONTAKT,
  emailLayout,
  escapeHtml,
  isValidEmail,
  sendEmail,
  sendEmailResult,
} from "@/lib/email";

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
    }),
    { log: { event: "studio_welcome", recipientRole: "studio" } }
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

// =====================================================================
// Edycja / miękkie usuwanie / wiadomości do studia (migracja 013)
// =====================================================================

export type StudioActionResult = { ok: boolean; error?: string; message?: string };

const STUDIO_STATUSES = ["pending", "active", "suspended", "rejected"];

/**
 * Kontrola uprawnień dla akcji admina — ten sam mechanizm co w createStudio:
 * sprawdzamy WŁASNY profil zalogowanego (nie dotyka rekurencyjnej polityki RLS).
 */
async function requireAdmin(): Promise<
  { ok: true; email: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Brak sesji." };

  const { data: me } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") {
    return { ok: false, error: "Brak uprawnień (tylko admin)." };
  }
  return { ok: true, email: me.email || user.email || "" };
}

export type UpdateStudioInput = {
  business_name: string;
  address?: string;
  email: string;
  phone?: string;
  instagram?: string;
  specializations?: string;
  status: string;
};

/**
 * Edycja danych studia. Nazwa/adres/Instagram/specjalizacje/status siedzą
 * w `studios`, a e-mail i telefon w `profiles` (studios.id === profiles.id).
 *
 * Zmiana e-maila idzie NAJPIERW do Supabase Auth — to na ten adres studio
 * loguje się magic-linkiem. Gdyby zmienić tylko profil, studio dostawałoby
 * powiadomienia na nowy adres, a logowało się starym.
 */
export async function updateStudio(
  studioId: string,
  input: UpdateStudioInput
): Promise<StudioActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const businessName = input.business_name.trim();
  const email = input.email.trim().toLowerCase();
  if (!businessName) return { ok: false, error: "Nazwa firmy jest wymagana." };
  if (!isValidEmail(email)) return { ok: false, error: "Niepoprawny adres e-mail." };
  if (!STUDIO_STATUSES.includes(input.status)) {
    return { ok: false, error: "Nieznany status." };
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", studioId)
    .maybeSingle();
  if (!profile) return { ok: false, error: "Nie znaleziono profilu studia." };

  if (email !== (profile.email || "").toLowerCase()) {
    const { data: taken } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .neq("id", studioId)
      .maybeSingle();
    if (taken) {
      return { ok: false, error: "Ten e-mail jest już przypisany do innego konta." };
    }
    const { error: authErr } = await admin.auth.admin.updateUserById(studioId, {
      email,
      email_confirm: true,
    });
    if (authErr) {
      return {
        ok: false,
        error: `Nie udało się zmienić e-maila logowania: ${authErr.message}`,
      };
    }
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ email, phone: input.phone?.trim() || null })
    .eq("id", studioId);
  if (profileErr) {
    return { ok: false, error: `Błąd zapisu kontaktu: ${profileErr.message}` };
  }

  const specializations = (input.specializations || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { error: studioErr } = await admin
    .from("studios")
    .update({
      business_name: businessName,
      address: input.address?.trim() || null,
      instagram: input.instagram?.replace("@", "").trim() || null,
      specializations,
      status: input.status,
    })
    .eq("id", studioId);
  if (studioErr) {
    return { ok: false, error: `Błąd zapisu studia: ${studioErr.message}` };
  }

  revalidatePath("/admin/studia");
  return { ok: true, message: "Zapisano." };
}

/**
 * Miękkie usunięcie / przywrócenie. NIGDY nie kasujemy rekordu — wyceny,
 * przypisania i rozmowy powiązane ze studiem mają zostać w bazie.
 */
export async function setStudioDeleted(
  studioId: string,
  deleted: boolean
): Promise<StudioActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("studios")
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq("id", studioId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/studia");
  return { ok: true };
}

export type StudioMessageInput = {
  subject: string;
  body: string;
  channel: "both" | "email" | "panel";
};

/**
 * Wiadomość admin -> studio. Zawsze powstaje rekord w studio_messages
 * (dla 'email' to czysty log — panel studia pokazuje tylko 'both' i 'panel').
 * Adresat maila pochodzi z bazy, nigdy z formularza.
 */
export async function sendStudioMessage(
  studioId: string,
  input: StudioMessageInput
): Promise<StudioActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Treść wiadomości jest wymagana." };
  if (!["both", "email", "panel"].includes(input.channel)) {
    return { ok: false, error: "Nieznany kanał." };
  }
  const viaEmail = input.channel !== "panel";
  if (viaEmail && !subject) {
    return { ok: false, error: "Temat jest wymagany przy wysyłce mailem." };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", studioId)
    .maybeSingle();
  const to: string | null = isValidEmail(profile?.email) ? profile.email : null;

  let emailStatus: "sent" | "failed" | "skipped" = "skipped";
  let emailError: string | null = null;

  if (viaEmail) {
    if (!to) {
      emailStatus = "failed";
      emailError = "Studio nie ma poprawnego adresu e-mail.";
    } else {
      const res = await sendEmailResult(
        to,
        subject,
        emailLayout({
          title: escapeHtml(subject),
          body: `<p style="white-space:pre-wrap;margin:0;">${escapeHtml(body)}</p>`,
          ...(input.channel === "both"
            ? { ctaUrl: `${APP_URL}/studio/wiadomosci`, ctaLabel: "Otwórz w panelu" }
            : {}),
          footer: "Masz pytania? Odpisz na tę wiadomość.",
        }),
        {
          from: EMAIL_FROM_KONTAKT,
          log: { event: "admin_message", recipientRole: "studio" },
        }
      );
      emailStatus = res.status;
      emailError = res.error ? res.error.slice(0, 500) : null;
    }
  }

  const { error: insertErr } = await admin.from("studio_messages").insert({
    studio_id: studioId,
    subject: subject || null,
    body,
    channel: input.channel,
    email_status: emailStatus,
    email_error: emailError,
    created_by: auth.email,
  });
  if (insertErr) {
    return { ok: false, error: `Błąd zapisu wiadomości: ${insertErr.message}` };
  }

  if (viaEmail && emailStatus !== "sent") {
    return {
      ok: false,
      error:
        `Mail NIE został wysłany (${emailError || emailStatus}).` +
        (input.channel === "both" ? " Wiadomość jest widoczna w panelu studia." : ""),
    };
  }
  return {
    ok: true,
    message:
      input.channel === "panel"
        ? "Wiadomość zapisana w panelu studia."
        : input.channel === "both"
          ? `Mail wysłany na ${to} i zapisany w panelu studia.`
          : `Mail wysłany na ${to}.`,
  };
}
