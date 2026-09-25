import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAgentFeed } from "@/lib/agent/feed";

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

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const includeHidden = req.nextUrl.searchParams.get("hidden") === "1";
  const feed = await buildAgentFeed({ includeHidden });
  return NextResponse.json(feed);
}
