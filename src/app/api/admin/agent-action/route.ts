import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentActionKind } from "@/app/(dashboard)/admin/agent/types";
import { executeAgentAction } from "@/lib/agent/actions";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin" ? user : null;
}

const KINDS: AgentActionKind[] = ["assign_studio", "activate_studio", "request_info", "reply_email", "reply_social"];
const MAX_DRAFT = 5000;

export const dynamic = "force-dynamic";

/** Wykonanie akcji z karty agenta. Body: { cardId, kind, payload, draft }. */
export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    cardId?: unknown;
    kind?: unknown;
    payload?: unknown;
    draft?: unknown;
  } | null;

  const cardId = typeof body?.cardId === "string" ? body.cardId.trim() : "";
  const kind = typeof body?.kind === "string" ? (body.kind as AgentActionKind) : null;
  const payload =
    body?.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : undefined;
  const draft = typeof body?.draft === "string" ? body.draft : undefined;

  if (!cardId || cardId.length > 200) return NextResponse.json({ ok: false, error: "Brak cardId." }, { status: 400 });
  if (!kind || !KINDS.includes(kind)) return NextResponse.json({ ok: false, error: "Nieznana akcja." }, { status: 400 });
  if (draft && draft.length > MAX_DRAFT) {
    return NextResponse.json({ ok: false, error: `Treść za długa (max ${MAX_DRAFT} znaków).` }, { status: 400 });
  }

  const result = await executeAgentAction(createAdminClient(), user.id, { cardId, kind, payload, draft });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
