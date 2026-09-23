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
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toRow(row: Record<string, unknown>, keys: string[]): string {
  return keys.map((k) => csvEscape(row[k])).join(",");
}

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: orders, error } = await admin
    .from("orders")
    .select(`
      id, service_type, scope, city, car_brand, car_model, car_year,
      status, notes, created_at,
      profile:profiles!orders_client_id_fkey(email, full_name, phone)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const headers = [
    "id", "service_type", "scope", "city", "car_brand", "car_model", "car_year",
    "status", "notes", "created_at",
    "client_email", "client_name", "client_phone",
  ];

  const rows = (orders ?? []).map((o: Record<string, unknown>) => {
    const profile = o.profile as Record<string, unknown> | null;
    return toRow(
      {
        id: o.id,
        service_type: o.service_type,
        scope: o.scope,
        city: o.city,
        car_brand: o.car_brand,
        car_model: o.car_model,
        car_year: o.car_year,
        status: o.status,
        notes: o.notes,
        created_at: o.created_at,
        client_email: profile?.email ?? "",
        client_name: profile?.full_name ?? "",
        client_phone: profile?.phone ?? "",
      },
      headers
    );
  });

  const bom = "﻿";
  const csv = bom + headers.join(",") + "\n" + rows.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="zlecenia-eksport.csv"',
    },
  });
}
