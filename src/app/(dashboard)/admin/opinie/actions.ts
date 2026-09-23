"use server";
import { revalidatePath } from "next/cache";
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

export async function getReviewsAdmin() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("reviews")
    .select(
      "id, created_at, author_name, rating, comment, status, studio:studios!reviews_studio_id_fkey(business_name, slug)"
    )
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function setReviewStatus(id: string, status: "published" | "rejected" | "pending") {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("reviews")
    .update({
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  revalidatePath("/admin/opinie");
  return { ok: !error, error: error?.message };
}

export async function deleteReview(id: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("reviews").delete().eq("id", id);
  revalidatePath("/admin/opinie");
  return { ok: !error, error: error?.message };
}
