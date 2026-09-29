"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  BLAD_BRAK_USLUG,
  maUslugeCore,
  oczyscUslugi,
  opisNaTablice,
  ustawUKlienta,
} from "@/lib/uslugi";

export type StudioProfileInput = {
  business_name: string;
  description: string;
  services: string[];
  u_klienta: boolean;
  /** „Inne usługi (opis)”, po przecinku → studios.specializations. */
  specializations: string;
  foil_brands: string;
  instagram: string;
  website: string;
  address: string;
  service_radius_km: string;
  is_paused: boolean;
  /** Pauza do daty (RRRR-MM-DD) — po niej cron sam wznawia leady. Puste = bez daty. */
  paused_until?: string;
};

export type StudioProfileResult = { ok: boolean; error?: string };

/**
 * Zapis profilu przez samo studio. Dotąd szedł z przeglądarki; teraz serwer
 * wymaga min. 1 usługi ze słownika (bez tego studio nie pasuje do żadnego zlecenia).
 * Sesja użytkownika + RLS „Studio can update own” — zapis tylko własnego wiersza.
 */
export async function updateOwnStudioProfile(input: StudioProfileInput): Promise<StudioProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesja wygasła — zaloguj się ponownie." };

  const services = oczyscUslugi(input.services);
  if (!maUslugeCore(services)) return { ok: false, error: BLAD_BRAK_USLUG };

  const { data: prev } = await supabase.from("studios").select("work_mode").eq("id", user.id).maybeSingle();
  if (!prev) return { ok: false, error: "Nie znaleziono profilu studia dla tego konta." };

  const radius = parseInt(input.service_radius_km, 10);
  const { data: updated, error } = await supabase
    .from("studios")
    .update({
      business_name: input.business_name.trim() || null,
      description: input.description.trim() || null,
      services,
      work_mode: ustawUKlienta(prev.work_mode, input.u_klienta),
      specializations: opisNaTablice(input.specializations),
      foil_brands: opisNaTablice(input.foil_brands),
      instagram: input.instagram.replace("@", "").trim() || null,
      website: input.website.trim() || null,
      address: input.address.trim() || null,
      service_radius_km: Number.isFinite(radius) ? radius : 50,
      is_paused: Boolean(input.is_paused),
    })
    .eq("id", user.id)
    .select("id");

  if (error) {
    console.error("[updateOwnStudioProfile]", error);
    return { ok: false, error: `Nie udało się zapisać: ${error.message}` };
  }
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error:
        "Zapis nie powiódł się — brak uprawnień lub profil nie istnieje. Odśwież stronę i spróbuj ponownie. " +
        "Jeśli problem się powtarza, napisz do nas.",
    };
  }

  // Pauza do daty: osobny zapis, bo kolumna paused_until dochodzi z migracją 028b — jej brak
  // nie może blokować zapisu reszty profilu.
  const pauzaDo = input.is_paused && /^d{4}-d{2}-d{2}$/.test(input.paused_until ?? "") ? `${input.paused_until}T06:00:00Z` : null;
  const { error: pauzaErr } = await supabase.from("studios").update({ paused_until: pauzaDo }).eq("id", user.id);
  if (pauzaErr && pauzaDo) console.warn("[updateOwnStudioProfile] paused_until:", pauzaErr.message);

  revalidatePath("/studio");
  revalidatePath("/studio/profil");
  return { ok: true };
}
