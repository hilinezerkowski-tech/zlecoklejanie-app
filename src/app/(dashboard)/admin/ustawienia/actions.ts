"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOMYSLNE_SLA, scalUstawieniaSla, type UstawieniaSla } from "@/lib/sla";

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
