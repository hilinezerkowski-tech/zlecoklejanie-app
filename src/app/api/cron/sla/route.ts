import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoryzowanyCron } from "@/lib/cron-auth";
import { przetworzTerminy } from "@/lib/sla-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Pilnowanie terminu odpowiedzi studia (przypomnienia, wygasanie, wznowienie z pauzy).
 * Wołane co 15 min z pg_cron + pg_net w Supabase (029_cron_sla.sql) albo z crona Vercela.
 */
async function obsluz(req: NextRequest) {
  if (!autoryzowanyCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const wynik = await przetworzTerminy(createAdminClient());
  return NextResponse.json({ ok: true, ...wynik });
}

export const GET = obsluz; // Vercel Cron wysyła GET
export const POST = obsluz; // pg_net
