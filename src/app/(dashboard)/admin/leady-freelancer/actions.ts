"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");
}

export async function getFreelancerLeads() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("freelancer_leads")
    .select("id, created_at, source, handle, name, city, phone, instagram_url, score, status, contacted_at, notes")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function updateLeadStatus(id: string, status: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("freelancer_leads")
    .update({ status, contacted_at: ["dm_wyslany", "odpowiedzial"].includes(status) ? new Date().toISOString() : undefined })
    .eq("id", id);
  return { ok: !error, error: error?.message };
}

export async function updateLeadScore(id: string, score: number) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("freelancer_leads")
    .update({ score })
    .eq("id", id);
  return { ok: !error, error: error?.message };
}

export async function addFreelancerLead(data: {
  source: string;
  handle?: string;
  name?: string;
  city?: string;
  phone?: string;
  instagram_url?: string;
  notes?: string;
}) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("freelancer_leads").insert(data);
  return { ok: !error, error: error?.message };
}
