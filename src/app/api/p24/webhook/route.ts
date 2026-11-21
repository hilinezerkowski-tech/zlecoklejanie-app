/**
 * Powiadomienie Przelewy24 o płatności (urlStatus) — Gate 1, Faza 2.
 *
 * Publiczny endpoint (P24 nie ma sesji), broni się sam: podpis SHA-384 z kluczem CRC,
 * merchantId/posId, kwota porównana z wierszem `platnosci` w bazie, potem PUT /transaction/verify
 * do P24 i dopiero wtedy księgowanie (idempotentne). Logika: src/lib/platnosci.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { obsluzPowiadomienie } from "@/lib/platnosci";
import type { PowiadomienieP24 } from "@/lib/p24";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let n: PowiadomienieP24;
  try {
    n = (await req.json()) as PowiadomienieP24;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const wynik = await obsluzPowiadomienie(createAdminClient(), n);
  return NextResponse.json({ status: wynik.status === 200 ? "OK" : "ERROR", info: wynik.komunikat }, { status: wynik.status });
}
