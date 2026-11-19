// Ustawienia automatyzacji zleceń (Etap 7) — tabela app_settings, przełączniki domyślnie WYŁ.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Klucz w app_settings: { wlaczona: boolean }. */
export const KLUCZ_AUTO_PRZYPISANIE = "auto_przypisanie";

/** Promień szukania studiów przy automatycznym przypisaniu (Faza 4 dołoży kolejne progi). */
export const PROMIEN_KM = 50;

/** Czy włączone „Automatyczne przypisywanie zleceń”. Brak wiersza / tabeli = WYŁ. */
export async function czyAutoPrzypisanie(admin: SupabaseClient): Promise<boolean> {
  const { data } = await admin.from("app_settings").select("value").eq("key", KLUCZ_AUTO_PRZYPISANIE).maybeSingle();
  return Boolean((data?.value as { wlaczona?: boolean } | null)?.wlaczona);
}
