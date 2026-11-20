"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOMYSLNE_SLA, scalUstawieniaSla, type UstawieniaSla } from "@/lib/sla";
import { KLUCZ_AUTO_PRZYPISANIE, KLUCZ_PROMIENIE, oczyscPromienie } from "@/lib/automation/ustawienia";
import { KLUCZ_PLATNE_WYCENY, KLUCZ_PUNKTY } from "@/lib/punkty";

export type WynikUstawien = { ok: true; message: string } | { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Brak sesji." };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return { ok: false, error: "Tylko admin." };
  return { ok: true, userId: user.id };
}

async function zapisz(key: string, value: unknown, userId: string): Promise<WynikUstawien> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) {
    return {
      ok: false,
      error: /app_settings/.test(error.message)
        ? "Brak tabeli ustawień — odpal migrację 028b w SQL Editorze."
        : `Nie udało się zapisać: ${error.message}`,
    };
  }
  revalidatePath("/admin/ustawienia");
  return { ok: true, message: "Zapisano." };
}

/** „Automatyczna podmiana studia” — domyślnie WYŁ. Gdy WŁ., cron sam przypisuje następnego kandydata. */
export async function ustawAutoPodmiane(wlaczona: boolean): Promise<WynikUstawien> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  return zapisz("auto_podmiana", { wlaczona: Boolean(wlaczona) }, auth.userId);
}

/**
 * „Automatyczne przypisywanie zleceń” (Etap 7) — domyślnie WYŁ. Gdy WŁ., nowe zgłoszenie
 * klienta bez flagi filtra samo zamienia się w zlecenie i dostaje do 3 pasujących studiów.
 */
export async function ustawAutoPrzypisanie(wlaczona: boolean): Promise<WynikUstawien> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  return zapisz(KLUCZ_AUTO_PRZYPISANIE, { wlaczona: Boolean(wlaczona) }, auth.userId);
}

/** Promienie szukania studiów przez automat (Faza 4), np. [50, 100, 200]. */
export async function zapiszPromienie(promienie: number[]): Promise<WynikUstawien> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const czyste = oczyscPromienie(promienie);
  if (!czyste) {
    return { ok: false, error: "Promienie: 1–3 liczby całkowite od 1 do 500 km, każda większa od poprzedniej." };
  }
  return zapisz(KLUCZ_PROMIENIE, { promienie: czyste }, auth.userId);
}

export async function zapiszUstawieniaSla(input: UstawieniaSla): Promise<WynikUstawien> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const s = scalUstawieniaSla(input);
  // scalUstawieniaSla po cichu wraca do domyślnych przy niespójnych danych — tu mówimy o tym wprost.
  const zgodne = (Object.keys(DOMYSLNE_SLA) as (keyof UstawieniaSla)[]).every((k) => s[k] === Number(input[k]));
  if (!zgodne) {
    return {
      ok: false,
      error: "Niespójne wartości: przypomnienie 1 < przypomnienie 2 < wygaśnięcie, a godziny pracy „od” < „do” (0–24).",
    };
  }
  return zapisz("sla", s, auth.userId);
}

/**
 * „Płatne wyceny” (Gate 1) — domyślnie WYŁ. Gdy WŁ., każda wysłana wycena zużywa 1 punkt
 * (trigger w bazie, migracja 033), a automat pomija studia bez punktów.
 * Regulamin: opłaty ogłaszamy wykonawcom min. 30 dni przed włączeniem.
 */
export async function ustawPlatneWyceny(wlaczona: boolean): Promise<WynikUstawien> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  return zapisz(KLUCZ_PLATNE_WYCENY, { wlaczona: Boolean(wlaczona) }, auth.userId);
}

/** Punkty startowe i pakiet do kupienia. Pusty pakiet = doładowanie niedostępne. */
export async function zapiszPunkty(input: {
  start: number;
  pakietPunkty: number | null;
  pakietCenaZl: number | null;
}): Promise<WynikUstawien> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const start = Number(input.start);
  if (!Number.isInteger(start) || start < 0 || start > 1000) {
    return { ok: false, error: "Punkty startowe: liczba całkowita 0–1000." };
  }
  const pp = input.pakietPunkty == null ? null : Number(input.pakietPunkty);
  const cena = input.pakietCenaZl == null ? null : Number(input.pakietCenaZl);
  if ((pp == null) !== (cena == null)) {
    return { ok: false, error: "Pakiet: podaj i liczbę punktów, i cenę — albo zostaw oba pola puste." };
  }
  if (pp != null && (!Number.isInteger(pp) || pp < 1 || pp > 1000)) {
    return { ok: false, error: "Pakiet: liczba punktów całkowita 1–1000." };
  }
  if (cena != null && (!Number.isFinite(cena) || cena < 1 || cena > 100000)) {
    return { ok: false, error: "Pakiet: cena od 1 do 100 000 zł." };
  }
  return zapisz(
    KLUCZ_PUNKTY,
    { start, pakiet_punkty: pp, pakiet_cena_zl: cena == null ? null : Math.round(cena * 100) / 100 },
    auth.userId
  );
}
