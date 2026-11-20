// Ustawienia automatyzacji zleceń (Etap 7) — tabela app_settings, przełączniki domyślnie WYŁ.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Klucz w app_settings: { wlaczona: boolean }. */
export const KLUCZ_AUTO_PRZYPISANIE = "auto_przypisanie";

/** Klucz w app_settings: { promienie: number[] } — kolejne promienie szukania studiów (Faza 4). */
export const KLUCZ_PROMIENIE = "automat_promienie";

export const DOMYSLNE_PROMIENIE = [50, 100, 200] as const;
const MAX_PROMIEN_KM = 500;

/** Czy włączone „Automatyczne przypisywanie zleceń”. Brak wiersza / tabeli = WYŁ. */
export async function czyAutoPrzypisanie(admin: SupabaseClient): Promise<boolean> {
  const { data } = await admin.from("app_settings").select("value").eq("key", KLUCZ_AUTO_PRZYPISANIE).maybeSingle();
  return Boolean((data?.value as { wlaczona?: boolean } | null)?.wlaczona);
}

/**
 * Promienie z ustawień: liczby całkowite 1–500 km, ściśle rosnące, 1–3 progi.
 * Niespójne dane = null (wołający decyduje: domyślne albo komunikat błędu).
 */
export function oczyscPromienie(input: unknown): number[] | null {
  if (!Array.isArray(input)) return null;
  const liczby = input.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (liczby.length === 0 || liczby.length > 3 || liczby.length !== input.length) return null;
  if (liczby.some((v) => !Number.isInteger(v) || v < 1 || v > MAX_PROMIEN_KM)) return null;
  if (liczby.some((v, i) => i > 0 && v <= liczby[i - 1])) return null;
  return liczby;
}

/** Promienie do automatu — z app_settings albo domyślne 50 / 100 / 200 km. */
export async function pobierzPromienie(admin: SupabaseClient): Promise<number[]> {
  const { data } = await admin.from("app_settings").select("value").eq("key", KLUCZ_PROMIENIE).maybeSingle();
  return oczyscPromienie((data?.value as { promienie?: unknown } | null)?.promienie) ?? [...DOMYSLNE_PROMIENIE];
}
