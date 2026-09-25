// /admin/agent — Faza 0 (powłoka UI na danych pokazowych)

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildAgentFeed } from "@/lib/agent/feed";
import AgentDashboard from "./agent-dashboard";

export const metadata = { title: "Agent — ZlecOklejanie.pl" };
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");
}

export default async function AgentPage() {
  await requireAdmin();
  const initialFeed = await buildAgentFeed();
  return <AgentDashboard initialFeed={initialFeed} />;
}
