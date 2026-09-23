"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/");
  return { ok: true as const };
}

export async function getStudioDetail(studioId: string) {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: studio } = await admin
    .from("studios")
    .select(`
      id,
      business_name,
      nip,
      slug,
      description,
      specializations,
      foil_brands,
      instagram,
      website,
      address,
      service_radius_km,
      google_rating,
      google_reviews_count,
      status,
      rejection_reason,
      verified_at,
      created_at,
      deleted_at,
      profile:profiles!studios_id_fkey(
        id, email, full_name, phone, city
      )
    `)
    .eq("id", studioId)
    .single();

  if (!studio) return null;

  const { data: assignments } = await admin
    .from("order_assignments")
    .select(`
      id,
      status,
      assigned_at,
      order:orders(
        id, service_type, scope, city,
        car_brand, car_model, car_year,
        status, created_at
      )
    `)
    .eq("studio_id", studioId)
    .order("assigned_at", { ascending: false })
    .limit(20);

  const { data: quotes } = await admin
    .from("quotes")
    .select(`
      id,
      price_min,
      price_max,
      comment,
      estimated_days,
      status,
      created_at,
      order:orders(
        id, city, car_brand, car_model, service_type
      )
    `)
    .eq("studio_id", studioId)
    .order("created_at", { ascending: false })
    .limit(20);

  const email = (studio.profile as { email: string } | null)?.email;
  let emailLog: {
    event: string;
    subject: string;
    status: string;
    created_at: string;
  }[] = [];
  if (email) {
    const { data: logs } = await admin
      .from("email_log")
      .select("event, subject, status, created_at")
      .eq("recipient", email)
      .order("created_at", { ascending: false })
      .limit(15);
    emailLog = logs ?? [];
  }

  return {
    studio,
    assignments: assignments ?? [],
    quotes: quotes ?? [],
    emailLog,
  };
}
