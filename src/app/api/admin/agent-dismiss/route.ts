import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin" ? user : null;
}

export const dynamic = "force-dynamic";

/** Ukrywa kartę: "Później" / "Pomiń" w panelu agenta. */
export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { cardId?: string } | null;
  const cardId = body?.cardId?.trim();
  if (!cardId) return NextResponse.json({ error: "Brak cardId." }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("agent_dismissed")
    .upsert({ card_id: cardId, dismissed_by: user.id, dismissed_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/** Przywraca ukrytą kartę: przycisk "Pokaż ukryte" → "Przywróć". */
export async function DELETE(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cardId = req.nextUrl.searchParams.get("cardId")?.trim();
  if (!cardId) return NextResponse.json({ error: "Brak cardId." }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("agent_dismissed").delete().eq("card_id", cardId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
