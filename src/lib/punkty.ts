// Punkty za wyceny (Gate 1, brief „Gate 1 — płatność za wycenę"). 1 punkt = 1 wysłana wycena.
//
// Zużycie punktu robi BAZA (trigger trg_zuzyj_punkt_za_wycene, migracja 033) — tu tylko odczyt
// stanu do UI, maili i automatu. Punkty startowe nadaje trigger przy aktywacji studia.
// Przełącznik `platne_wyceny` (app_settings) domyślnie WYŁ.: wtedy nikt nie płaci, saldo tylko widać.
// Tolerancyjnie: bez migracji 033 (brak tabel/kluczy) wszystko działa jak przed Gate 1.

import type { SupabaseClient } from "@supabase/supabase-js";

export const KLUCZ_PLATNE_WYCENY = "platne_wyceny";
export const KLUCZ_PUNKTY = "punkty";
export const PUNKTY_START_DOMYSLNIE = 10;

/** Kod błędu z triggera bazy, gdy studio nie ma punktów. */
export const BLAD_BRAK_PUNKTOW = "BRAK_PUNKTOW";

export type UstawieniaPunktow = {
  start: number;
  /** Pakiet do kupienia — null, dopóki admin nie ustawi ceny (wtedy nie da się doładować). */
  pakietPunkty: number | null;
  pakietCenaZl: number | null;
};

export type SaldoStudia = { saldo: number; zwolnione: boolean };

export function czyBrakPunktow(komunikat: string | null | undefined): boolean {
  return Boolean(komunikat && komunikat.includes(BLAD_BRAK_PUNKTOW));
}

const liczbaLubNull = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export function oczyscUstawieniaPunktow(v: unknown): UstawieniaPunktow {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const start = liczbaLubNull(o.start, 0, 1000);
  const pakietPunkty = liczbaLubNull(o.pakiet_punkty, 1, 1000);
  const cena = liczbaLubNull(o.pakiet_cena_zl, 1, 100000);
  return {
    start: start != null ? Math.round(start) : PUNKTY_START_DOMYSLNIE,
    pakietPunkty: pakietPunkty != null ? Math.round(pakietPunkty) : null,
    pakietCenaZl: cena != null ? Math.round(cena * 100) / 100 : null,
  };
}

export async function czyPlatneWyceny(admin: SupabaseClient): Promise<boolean> {
  const { data } = await admin.from("app_settings").select("value").eq("key", KLUCZ_PLATNE_WYCENY).maybeSingle();
  return Boolean((data?.value as { wlaczona?: boolean } | undefined)?.wlaczona);
}

export async function pobierzUstawieniaPunktow(admin: SupabaseClient): Promise<UstawieniaPunktow> {
  const { data } = await admin.from("app_settings").select("value").eq("key", KLUCZ_PUNKTY).maybeSingle();
  return oczyscUstawieniaPunktow(data?.value);
}

/** Saldo jednego studia; null = brak wiersza (np. studio nieaktywne albo brak migracji 033). */
export async function pobierzSaldo(admin: SupabaseClient, studioId: string): Promise<SaldoStudia | null> {
  const { data, error } = await admin
    .from("punkty_studia")
    .select("saldo, zwolnione")
    .eq("studio_id", studioId)
    .maybeSingle();
  if (error || !data) return null;
  return { saldo: data.saldo ?? 0, zwolnione: Boolean(data.zwolnione) };
}

/** Czy studio może teraz wysłać wycenę (ten sam warunek co trigger w bazie). */
export function mozeWycenic(platne: boolean, saldo: SaldoStudia | null): boolean {
  if (!platne) return true;
  if (saldo?.zwolnione) return true;
  return (saldo?.saldo ?? 0) > 0;
}

/**
 * Studia, których automat ma NIE wybierać, bo nie mają punktów (decyzja Wojtka 20.11.2026).
 * Przy WYŁ. płatnych wycenach — pusty zbiór. Ręczne przypisanie przez admina działa dalej.
 */
export async function studiaBezPunktow(admin: SupabaseClient, studioIds: string[]): Promise<Set<string>> {
  if (studioIds.length === 0 || !(await czyPlatneWyceny(admin))) return new Set();
  const { data, error } = await admin.from("punkty_studia").select("studio_id, saldo, zwolnione").in("studio_id", studioIds);
  if (error) return new Set(); // bez tabeli nie blokujemy automatu
  const zPunktami = new Set(
    ((data ?? []) as { studio_id: string; saldo: number; zwolnione: boolean }[])
      .filter((r) => r.zwolnione || r.saldo > 0)
      .map((r) => r.studio_id)
  );
  return new Set(studioIds.filter((id) => !zPunktami.has(id)));
}

export const ETYKIETA_ZRODLA: Record<string, string> = {
  start_gratis: "Punkty startowe",
  platnosc_p24: "Doładowanie",
  zuzycie_wyceny: "Wycena zlecenia",
  korekta: "Korekta",
};

/** „1 punkt”, „2 punkty”, „5 punktów”. */
export function punktyTxt(n: number): string {
  const a = Math.abs(n);
  if (a === 1) return `${n} punkt`;
  const d = a % 10;
  const s = a % 100;
  return `${n} ${d >= 2 && d <= 4 && (s < 12 || s > 14) ? "punkty" : "punktów"}`;
}
