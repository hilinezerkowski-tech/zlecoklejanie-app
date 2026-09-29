"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchOgImage } from "@/lib/studio-cover";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");
}

export type CoverResult = { ok: boolean; found: number; checked: number; missing: string[]; error?: string };

/**
 * Pobiera og:image ze strony www aktywnych studiów, które nie mają ani portfolio, ani okładki.
 * Zapisuje do studios.cover_url. Studia bez strony lub bez og:image zostają na placeholderze.
 */
export async function fetchMissingCovers(): Promise<CoverResult> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("studios")
    .select("id, business_name, website, portfolio, cover_url")
    .eq("status", "active")
    .is("deleted_at", null)
    .not("website", "is", null);
  if (error) return { ok: false, found: 0, checked: 0, missing: [], error: error.message };

  const todo = (data ?? []).filter(
    (s) => s.website && !s.cover_url && !(Array.isArray(s.portfolio) && s.portfolio.length > 0)
  );
  let found = 0;
  const missing: string[] = [];
  for (const s of todo) {
    let url: string | null = null;
    try {
      url = await fetchOgImage(s.website as string);
    } catch {
      url = null;
    }
    await admin
      .from("studios")
      .update({ cover_url: url, cover_source: url ? "og:image" : null, cover_checked_at: new Date().toISOString() })
      .eq("id", s.id);
    if (url) found++;
    else missing.push(s.business_name || s.id);
  }
  revalidatePath("/wykonawcy");
  revalidatePath("/admin/studia");
  return { ok: true, found, checked: todo.length, missing };
}
