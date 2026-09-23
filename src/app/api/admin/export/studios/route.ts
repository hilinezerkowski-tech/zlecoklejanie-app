"use server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin" ? user : null;
}

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes(""") || s.includes("
")) {
    return """+s.replace(/"/g, """") + """;
  }
  return s;
}

function toRow(row: Record<string, unknown>, keys: string[]): string {
  return keys.map(k => csvEscape(row[k])).join(",");
}

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: studios, error } = await admin
    .from("studios")
    .select(`
      id, business_name, nip, slug, status, verified_at, created_at, deleted_at,
      description, instagram, website, address, service_radius_km,
      google_rating, google_reviews_count,
      profile:profiles!studios_id_fkey(email, full_name, phone, city)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const headers = [
    "id", "business_name", "nip", "slug", "status", "verified_at", "created_at", "deleted_at",
    "description", "instagram", "website", "address", "service_radius_km",
    "google_rating", "google_reviews_count",
    "email", "contact_name", "phone", "city"
  ];

  const rows = (studios ?? []).map((s: Record<string, unknown>) => {
    const profile = s.profile as Record<string, unknown> | null;
    return toRow({
      id: s.id,
      business_name: s.business_name,
      nip: s.nip,
      slug: s.slug,
      status: s.status,
      verified_at: s.verified_at,
      created_at: s.created_at,
      deleted_at: s.deleted_at,
      description: s.description,
      instagram: s.instagram,
      website: s.website,
      address: s.address,
      service_radius_km: s.service_radius_km,
      google_rating: s.google_rating,
      google_reviews_count: s.google_reviews_count,
      email: profile?.email ?? "",
      contact_name: profile?.full_name ?? "",
      phone: profile?.phone ?? "",
      city: profile?.city ?? "",
    }, headers);
  });

  const bom = "﻿";
  const csv = bom + headers.join(",") + "
" + rows.join("
");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename="studia-eksport.csv"",
    },
  });
}
