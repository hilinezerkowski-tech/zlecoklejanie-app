"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

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

  revalidatePath("/admin/studia");
  return { ok: true, message: `Studio „${businessName}" dodane i aktywowane.` };
}
