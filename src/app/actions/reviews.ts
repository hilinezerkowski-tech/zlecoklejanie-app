"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

// Odpowiedź studia (lub admina) na opinię. Studio może odpowiadać tylko na
// opinie dotyczące jego własnego profilu (reviews.studio_id === auth uid).
export async function replyToReview(
  reviewId: string,
  reply: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Brak sesji." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const admin = createAdminClient();
  const { data: review } = await admin
    .from("reviews")
    .select("studio_id")
    .eq("id", reviewId)
    .single();
  if (!review) return { ok: false, error: "Nie ma takiej opinii." };

  const allowed =
    profile?.role === "admin" ||
    (profile?.role === "studio" && review.studio_id === user.id);
  if (!allowed) return { ok: false, error: "Brak uprawnień." };

  const clean = reply.trim().slice(0, 1000);
  await admin
    .from("reviews")
    .update({
      reply: clean || null,
      reply_at: clean ? new Date().toISOString() : null,
    })
    .eq("id", reviewId);

  revalidatePath("/studio/opinie");
  return { ok: true };
}
