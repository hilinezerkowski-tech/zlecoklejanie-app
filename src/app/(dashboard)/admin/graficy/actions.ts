"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { sendDesignerWelcome } from "@/lib/designer-welcome";

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
