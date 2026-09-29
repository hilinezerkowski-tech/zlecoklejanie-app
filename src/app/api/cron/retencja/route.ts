import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoryzowanyCron } from "@/lib/cron-auth";
import { przetworzRetencje } from "@/lib/retencja";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Retencja wiadomości (12 mies. od ostatniej aktywności w zleceniu).
 * Domyślnie tryb próbny (tylko liczy). Usuwa dopiero z RETENCJA_USUWAJ=1 w env ORAZ ?usun=1.
 */
async function obsluz(req: NextRequest) {
  if (!autoryzowanyCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const usun = process.env.RETENCJA_USUWAJ === "1" && req.nextUrl.searchParams.get("usun") === "1";
  try {
    const wynik = await przetworzRetencje(createAdminClient(), usun);
    return NextResponse.json({ ok: true, ...wynik });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = obsluz;
export const POST = obsluz;
