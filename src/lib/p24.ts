// Przelewy24 REST API v1 — rejestracja transakcji, weryfikacja powiadomienia i transakcji.
// Gate 1, Faza 2 (doładowanie punktów). Tylko serwer.
//
// Env (wpisuje Wojtek w Vercelu): P24_MERCHANT_ID, P24_POS_ID, P24_CRC, P24_API_KEY.
// P24_SANDBOX: domyślnie tryb testowy (sandbox.przelewy24.pl); produkcja dopiero z P24_SANDBOX=0.
// Brak kluczy → p24Konfiguracja() zwraca null, a przycisk doładowania jest nieaktywny.
//
// Podpisy: SHA-384 z JSON-a o stałej kolejności kluczy (JSON.stringify nie escapuje „/” ani
// polskich znaków — tak jak wymaga P24). Kolejność kluczy jest częścią podpisu.

import { createHash } from "crypto";

export type P24Konfiguracja = {
  merchantId: number;
  posId: number;
  crc: string;
  apiKey: string;
  sandbox: boolean;
  baseUrl: string;
};

export function p24Konfiguracja(): P24Konfiguracja | null {
  const merchantId = Number(process.env.P24_MERCHANT_ID);
  const posId = Number(process.env.P24_POS_ID || process.env.P24_MERCHANT_ID);
  const crc = process.env.P24_CRC?.trim();
  const apiKey = process.env.P24_API_KEY?.trim();
  if (!Number.isInteger(merchantId) || merchantId <= 0 || !Number.isInteger(posId) || posId <= 0 || !crc || !apiKey) {
    return null;
  }
  const sandbox = process.env.P24_SANDBOX !== "0";
  return { merchantId, posId, crc, apiKey, sandbox, baseUrl: sandbox ? "https://sandbox.przelewy24.pl" : "https://secure.przelewy24.pl" };
}

const sha384 = (o: unknown) => createHash("sha384").update(JSON.stringify(o), "utf8").digest("hex");

function naglowki(k: P24Konfiguracja) {
  return {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${k.posId}:${k.apiKey}`).toString("base64")}`,
  };
}

export type RejestracjaP24 = { ok: true; token: string; link: string } | { ok: false; error: string };

/** Rejestruje transakcję i zwraca link do strony płatności P24. Kwota w groszach. */
export async function zarejestrujTransakcje(
  k: P24Konfiguracja,
  t: { sessionId: string; amount: number; description: string; email: string; urlReturn: string; urlStatus: string }
): Promise<RejestracjaP24> {
  const sign = sha384({ sessionId: t.sessionId, merchantId: k.merchantId, amount: t.amount, currency: "PLN", crc: k.crc });
  try {
    const res = await fetch(`${k.baseUrl}/api/v1/transaction/register`, {
      method: "POST",
      headers: naglowki(k),
      body: JSON.stringify({
        merchantId: k.merchantId,
        posId: k.posId,
        sessionId: t.sessionId,
        amount: t.amount,
        currency: "PLN",
        description: t.description,
        email: t.email,
        country: "PL",
        language: "pl",
        urlReturn: t.urlReturn,
        urlStatus: t.urlStatus,
        timeLimit: 15,
        encoding: "UTF-8",
        sign,
      }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as { data?: { token?: string }; error?: string } | null;
    const token = body?.data?.token;
    if (!res.ok || !token) return { ok: false, error: `P24 register ${res.status}: ${body?.error ?? "brak tokenu"}` };
    return { ok: true, token, link: `${k.baseUrl}/trnRequest/${token}` };
  } catch (e) {
    return { ok: false, error: `P24 register: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export type PowiadomienieP24 = {
  merchantId: number;
  posId: number;
  sessionId: string;
  amount: number;
  originAmount: number;
  currency: string;
  orderId: number;
  methodId: number;
  statement: string;
  sign: string;
};

/** Podpis powiadomienia z urlStatus — klucze w kolejności z dokumentacji P24. */
export function podpisPowiadomieniaOk(k: P24Konfiguracja, n: PowiadomienieP24): boolean {
  const oczekiwany = sha384({
    merchantId: n.merchantId,
    posId: n.posId,
    sessionId: n.sessionId,
    amount: n.amount,
    originAmount: n.originAmount,
    currency: n.currency,
    orderId: n.orderId,
    methodId: n.methodId,
    statement: n.statement,
    crc: k.crc,
  });
  return typeof n.sign === "string" && n.sign.length === oczekiwany.length && n.sign === oczekiwany;
}

/** PUT /transaction/verify — bez tego P24 nie przekaże pieniędzy. true = status "success". */
export async function weryfikujTransakcje(
  k: P24Konfiguracja,
  t: { sessionId: string; orderId: number; amount: number }
): Promise<{ ok: boolean; error?: string }> {
  const sign = sha384({ sessionId: t.sessionId, orderId: t.orderId, amount: t.amount, currency: "PLN", crc: k.crc });
  try {
    const res = await fetch(`${k.baseUrl}/api/v1/transaction/verify`, {
      method: "PUT",
      headers: naglowki(k),
      body: JSON.stringify({
        merchantId: k.merchantId,
        posId: k.posId,
        sessionId: t.sessionId,
        amount: t.amount,
        currency: "PLN",
        orderId: t.orderId,
        sign,
      }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as { data?: { status?: string }; error?: string } | null;
    if (res.ok && body?.data?.status === "success") return { ok: true };
    return { ok: false, error: `P24 verify ${res.status}: ${body?.error ?? body?.data?.status ?? "?"}` };
  } catch (e) {
    return { ok: false, error: `P24 verify: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** GET /testAccess — sprawdzenie kluczy (strona diagnostyczna admina). */
export async function testDostepu(k: P24Konfiguracja): Promise<boolean> {
  try {
    const res = await fetch(`${k.baseUrl}/api/v1/testAccess`, { headers: naglowki(k), cache: "no-store" });
    const body = (await res.json().catch(() => null)) as { data?: boolean } | null;
    return res.ok && body?.data === true;
  } catch {
    return false;
  }
}
