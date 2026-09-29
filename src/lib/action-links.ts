// Linki tokenowe „Wyceń / Odrzuć” w mailach i SMS do studia — bez logowania.
// Zasada z CLAUDE.md: każdy mail/SMS do studia lub klienta z akcją = link tokenowy stąd, nie magic link.
//
// Token = base64url(JSON {a: assignmentId, e: exp[s]}) + "." + base64url(HMAC-SHA256).
// Sekret: ACTION_LINK_SECRET (Vercel). Brak sekretu → linkAkcji() zwraca null, a maile
// wracają do zwykłego linku do panelu (nic się nie wywala).

import { createHmac, timingSafeEqual } from "node:crypto";
import { APP_URL } from "@/lib/email";

export const WAZNOSC_TOKENU_DNI = 7;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sekret = () => process.env.ACTION_LINK_SECRET || "";

function podpis(dane: string): string {
  return createHmac("sha256", sekret()).update(dane).digest("base64url");
}

export function utworzToken(assignmentId: string, dni = WAZNOSC_TOKENU_DNI): string | null {
  if (!sekret()) return null;
  const dane = b64(JSON.stringify({ a: assignmentId, e: Math.floor(Date.now() / 1000) + dni * 86400 }));
  return `${dane}.${podpis(dane)}`;
}

export type WynikTokenu =
  | { ok: true; assignmentId: string }
  | { ok: false; powod: "brak_sekretu" | "niepoprawny" | "wygasl" };

export function sprawdzToken(token: string): WynikTokenu {
  if (!sekret()) return { ok: false, powod: "brak_sekretu" };
  const [dane, sig] = token.split(".");
  if (!dane || !sig || token.length > 400) return { ok: false, powod: "niepoprawny" };
  const oczekiwany = Buffer.from(podpis(dane));
  const otrzymany = Buffer.from(sig);
  if (oczekiwany.length !== otrzymany.length || !timingSafeEqual(oczekiwany, otrzymany)) {
    return { ok: false, powod: "niepoprawny" };
  }
  try {
    const p = JSON.parse(Buffer.from(dane, "base64url").toString("utf8")) as { a?: unknown; e?: unknown };
    if (typeof p.a !== "string" || typeof p.e !== "number") return { ok: false, powod: "niepoprawny" };
    if (p.e < Math.floor(Date.now() / 1000)) return { ok: false, powod: "wygasl" };
    return { ok: true, assignmentId: p.a };
  } catch {
    return { ok: false, powod: "niepoprawny" };
  }
}

/** Pełny link do strony /o/<token> albo null (brak sekretu). */
export function linkAkcji(assignmentId: string): string | null {
  const t = utworzToken(assignmentId);
  return t ? `${APP_URL}/o/${t}` : null;
}
