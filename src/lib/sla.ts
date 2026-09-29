// Czasy odpowiedzi studia (SLA) — JEDNO miejsce. Zasada z CLAUDE.md: czasy SLA tylko stąd
// albo z ustawień admina (/admin/ustawienia, tabela app_settings, klucz 'sla').
// Godziny robocze liczone w strefie Europe/Warsaw: pn–sob, domyślnie 8:00–20:00 [R].
//
// Tryb testowy (Bramka 2): SLA_TEST=1 → „1 godzina robocza” = 1 minuta, zawsze roboczo.

import type { SupabaseClient } from "@supabase/supabase-js";

export type UstawieniaSla = {
  /** Po ilu godzinach roboczych bez odpowiedzi: pierwsze przypomnienie. */
  przypomnienie1: number;
  /** ...ostatnie przypomnienie. */
  przypomnienie2: number;
  /** ...zlecenie przechodzi dalej (status expired). */
  wygasniecie: number;
  /** Godziny robocze (pełne godziny, Europe/Warsaw). */
  od: number;
  do: number;
};

export const DOMYSLNE_SLA: UstawieniaSla = {
  przypomnienie1: 4,
  przypomnienie2: 24,
  wygasniecie: 48,
  od: 8,
  do: 20,
};

const TZ = "Europe/Warsaw";
const KROK_MIN = 15;

export const trybTestowySla = () => process.env.SLA_TEST === "1";

/** Ustawienia z app_settings (klucz 'sla') z domyślnymi w miejscu braków/błędów. */
export async function pobierzUstawieniaSla(admin: SupabaseClient): Promise<UstawieniaSla> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "sla").maybeSingle();
  return scalUstawieniaSla(data?.value);
}

export function scalUstawieniaSla(raw: unknown): UstawieniaSla {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (k: keyof UstawieniaSla) =>
    typeof v[k] === "number" && Number.isFinite(v[k]) ? (v[k] as number) : DOMYSLNE_SLA[k];
  const s: UstawieniaSla = {
    przypomnienie1: num("przypomnienie1"),
    przypomnienie2: num("przypomnienie2"),
    wygasniecie: num("wygasniecie"),
    od: num("od"),
    do: num("do"),
  };
  // Niespójne wartości → wracamy do domyślnych (lepsze niż przypomnienia w nocy albo po terminie).
  const ok =
    s.od >= 0 &&
    s.do <= 24 &&
    s.od < s.do &&
    s.przypomnienie1 > 0 &&
    s.przypomnienie1 < s.przypomnienie2 &&
    s.przypomnienie2 < s.wygasniecie;
  return ok ? s : DOMYSLNE_SLA;
}

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23",
});

/** Czy w podanej chwili jest czas roboczy (pn–sob, od ≤ godz. < do, Warszawa). */
export function godzinyRobocze(at: Date, s: UstawieniaSla = DOMYSLNE_SLA): boolean {
  if (trybTestowySla()) return true;
  const parts = fmt.formatToParts(at);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  if (weekday === "Sun") return false;
  return hour >= s.od && hour < s.do;
}

/** Ile godzin roboczych minęło między dwoma chwilami (krok 15 min, limit ~30 dni). */
export function godzinyRoboczeMiedzy(od: Date, doo: Date, s: UstawieniaSla = DOMYSLNE_SLA): number {
  if (trybTestowySla()) return Math.max(0, (doo.getTime() - od.getTime()) / 60_000); // 1 h = 1 min
  let kroki = 0;
  const maks = (30 * 24 * 60) / KROK_MIN;
  for (let t = od.getTime(), i = 0; t < doo.getTime() && i < maks; t += KROK_MIN * 60_000, i++) {
    if (godzinyRobocze(new Date(t), s)) kroki++;
  }
  return (kroki * KROK_MIN) / 60;
}

/** Termin = chwila, w której upłynie `godz` godzin roboczych od `start`. */
export function dodajGodzinyRobocze(start: Date, godz: number, s: UstawieniaSla = DOMYSLNE_SLA): Date {
  if (trybTestowySla()) return new Date(start.getTime() + godz * 60_000);
  let pozostalo = (godz * 60) / KROK_MIN;
  let t = start.getTime();
  for (let i = 0; pozostalo > 0 && i < (60 * 24 * 60) / KROK_MIN; i++) {
    if (godzinyRobocze(new Date(t), s)) pozostalo--;
    t += KROK_MIN * 60_000;
  }
  return new Date(t);
}
