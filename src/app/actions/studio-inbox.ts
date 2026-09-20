"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

/**
 * Oznacza wiadomości od admina jako przeczytane — wołane przy otwarciu
 * skrzynki w panelu studia.
 *
 * Zapis idzie kluczem service role, bo studio_messages celowo NIE ma polityki
 * UPDATE (studio nie może edytować treści). Zakres jest sztywny: tylko wiersze
 * zalogowanego studia (studios.id === auth uid) i tylko kolumna read_at.
 */
export async function markStudioMessagesRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("studio_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("studio_id", user.id)
    .is("read_at", null)
    .in("channel", ["both", "panel"]);
  if (error) {
    console.warn("[studio-inbox] mark read failed:", error.message);
    return;
  }
  // Licznik nieprzeczytanych siedzi w sidebarze (layout)
  revalidatePath("/studio", "layout");
}
