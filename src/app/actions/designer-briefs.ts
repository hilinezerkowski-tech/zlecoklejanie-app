"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type BriefResponseResult = { ok: boolean; error?: string; message?: string };

/**
 * Grafik odpowiada na brief: bierze projekt albo odmawia.
 *
 * Zapis idzie kluczem service role, bo `order_designer_assignments` celowo
 * nie ma polityki UPDATE — inaczej grafik mógłby podmienić treść briefu albo
 * cudzy status. Zakres jest sztywny: własny wiersz, tylko `status`,
 * `responded_at` i `response_note`, i tylko dopóki brief czeka na odpowiedź.
 */
export async function respondToBrief(
  assignmentId: string,
  decision: "accepted" | "rejected",
  note?: string
): Promise<BriefResponseResult> {
  if (!["accepted", "rejected"].includes(decision)) {
    return { ok: false, error: "Nieznana odpowiedź." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Brak sesji." };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("order_designer_assignments")
    .select("id, designer_id, status")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!row || row.designer_id !== user.id) {
    return { ok: false, error: "Nie znaleziono briefu." };
  }
  if (row.status !== "pending") {
    return { ok: false, error: "Na ten brief już odpowiedziałeś." };
  }

  const { error } = await admin
    .from("order_designer_assignments")
    .update({
      status: decision,
      responded_at: new Date().toISOString(),
      response_note: note?.trim().slice(0, 1000) || null,
    })
    .eq("id", assignmentId)
    .eq("designer_id", user.id)
    .eq("status", "pending");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/grafik/briefy");
  // Licznik nieodczytanych briefów siedzi w menu (layout panelu)
  revalidatePath("/grafik", "layout");
  return {
    ok: true,
    message:
      decision === "accepted"
        ? "Dzięki — dajemy znać klientowi i skontaktujemy Was."
        : "Zanotowane, brief nie będzie Cię blokował.",
  };
}
