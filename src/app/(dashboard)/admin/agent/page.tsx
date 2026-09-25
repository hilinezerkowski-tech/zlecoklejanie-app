// /admin/agent — Faza 0 (powłoka UI na danych pokazowych)

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AgentDashboard from "./agent-dashboard";

export const metadata = { title: "Agent — ZlecOklejanie.pl" };

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
  return <AgentDashboard />;
}
