"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { APP_URL, emailLayout, escapeHtml, sendEmail } from "@/lib/email";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Mail powitalny dla grafika — z jednorazowym linkiem logowania.
 *
 * Ten sam mechanizm co przy studiach: konto zaklada admin przez
 * `auth.admin.createUser`, wiec Supabase nie wysyla nic z automatu.
 * Bez tego maila grafik ma konto, o ktorym nie wie.
 */
async function sendDesignerWelcome(
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
    })
  );
}

export type CreateDesignerInput = {
  email: string;
  display_name: string;
  city?: string;
  phone?: string;
  portfolio_url?: string;
  instagram?: string;
  website?: string;
  specializations?: string;
  software?: string;
  works_on_vehicle_templates?: boolean;
  price_from?: string;
  price_to?: string;
  monthly_capacity?: string;
};

export type CreateDesignerResult = {
  ok: boolean;
  error?: string;
  message?: string;
};

/** "1200,50" i "1 200 zł" -> 1200.5; pusty string -> null. */
function toNumber(v?: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toList(v?: string): string[] {
  return (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Tworzy (lub promuje istniejace) konto grafika i od razu je aktywuje.
 *
 * Logika lustrzana do `createStudio` — swiadomie, zeby admin mial jeden
 * model myslowy, a bledy naprawialo sie w obu miejscach tak samo.
 */
export async function createDesigner(
  input: CreateDesignerInput
): Promise<CreateDesignerResult> {
  // 1. Tylko admin. Czytamy WLASNY profil (auth.uid() = id), wiec nie wchodzimy
  //    w rekurencyjna polityke RLS na `profiles`.
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
  const displayName = input.display_name.trim();
  if (!email || !displayName) {
    return { ok: false, error: "Email i nazwa grafika są wymagane." };
  }

  // Portfolio to jedyny realny filtr jakosci przy grafiku. Bez niego
  // nie mamy czego pokazac klientowi i nie ma sensu go dodawac.
  const portfolio = input.portfolio_url?.trim() || "";
  if (!portfolio) {
    return {
      ok: false,
      error: "Link do portfolio jest wymagany — bez niego nie kierujemy briefów.",
    };
  }

  const admin = createAdminClient();

  // Zabezpieczenie: NIGDY nie degradujemy konta admina.
  // Bez tego dodanie grafika na adres admina nadpisuje role='admin'
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

  // 2. Konto auth bez hasla (logowanie magic-linkiem). Role 'designer'
  //    ustawia trigger handle_new_user na podstawie metadanych.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { role: "designer" },
  });

  if (createErr) {
    // Najczestszy przypadek: mail juz istnieje (wczesniejszy lead z landinga).
    // Wtedy promujemy istniejacy profil zamiast zwracac blad.
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing?.id) {
      userId = existing.id;
    } else {
      return {
        ok: false,
        error: `Nie udało się utworzyć konta: ${createErr.message}`,
      };
    }
  } else {
    userId = created.user?.id;
  }

  if (!userId) {
    return { ok: false, error: "Nie udało się uzyskać ID użytkownika." };
  }

  // 3. Rola + telefon (service role omija RLS).
  await admin
    .from("profiles")
    .update({ role: "designer", phone: input.phone?.trim() || null })
    .eq("id", userId);

  // 4. Rekord grafika — aktywny od razu, bo dodaje go admin.
  const { error: designerErr } = await admin.from("designers").upsert(
    {
      id: userId,
      display_name: displayName,
      city: input.city?.trim() || null,
      portfolio_url: portfolio,
      instagram: input.instagram?.replace("@", "").trim() || null,
      website: input.website?.trim() || null,
      specializations: toList(input.specializations),
      software: toList(input.software),
      works_on_vehicle_templates: Boolean(input.works_on_vehicle_templates),
      price_from: toNumber(input.price_from),
      price_to: toNumber(input.price_to),
      monthly_capacity: input.monthly_capacity
        ? parseInt(input.monthly_capacity, 10) || null
        : null,
      status: "active",
    },
    { onConflict: "id" }
  );

  if (designerErr) {
    // Najczestsza przyczyna: migracja 009 nie zostala uruchomiona.
    return {
      ok: false,
      error:
        `Błąd tworzenia grafika: ${designerErr.message}. ` +
        `Jeśli mowa o nieistniejącej tabeli — uruchom migrację 009_designers.sql.`,
    };
  }

  // 5. Mail powitalny. Nie blokuje sukcesu — konto ma powstac tak czy siak.
  const welcomeSent = await sendDesignerWelcome(admin, email, displayName);

  revalidatePath("/admin/graficy");
  return {
    ok: true,
    message:
      `Grafik „${displayName}" dodany i aktywowany. ` +
      (welcomeSent
        ? `Mail powitalny z linkiem logowania wysłany na ${email}.`
        : `UWAGA: nie udało się wysłać maila powitalnego na ${email} — skontaktuj się ręcznie.`),
  };
}
