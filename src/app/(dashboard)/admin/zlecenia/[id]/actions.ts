"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin oznacza wynik zlecenia: "completed" (doszło do skutku)
 * albo "cancelled" (nie doszło). Tylko dla roli admin.
 */
export async function setOrderOutcome(
  orderId: string,
  outcome: "completed" | "cancelled"
): Promise<{ ok: boolean; error?: string }> {
  if (!["completed", "cancelled"].includes(outcome)) {
    return { ok: false, error: "Nieprawidłowy status." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Brak sesji." };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") return { ok: false, error: "Tylko admin." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("orders")
    .update({ status: outcome })
    .eq("id", orderId)
    .not("status", "in", "(completed,cancelled)");

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/zlecenia/${orderId}`);
  revalidatePath("/admin/zlecenia");
  return { ok: true };
}
