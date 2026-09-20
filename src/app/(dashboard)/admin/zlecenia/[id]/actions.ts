"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAssignedEmail } from "@/lib/notify-assigned";

type ActionResult = { ok: boolean; error?: string; message?: string };

/** Wspólny check: zalogowany użytkownik z rolą admin. Zwraca id admina albo błąd. */
async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
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
  return { ok: true, userId: user.id };
}

function revalidateOrder(orderId: string) {
  revalidatePath(`/admin/zlecenia/${orderId}`);
  revalidatePath("/admin/zlecenia");
}

/**
 * Admin oznacza wynik zlecenia: "completed" (doszło do skutku)
 * albo "cancelled" (nie doszło). Tylko dla roli admin.
 */
export async function setOrderOutcome(
  orderId: string,
  outcome: "completed" | "cancelled"
): Promise<ActionResult> {
  if (!["completed", "cancelled"].includes(outcome)) {
    return { ok: false, error: "Nieprawidłowy status." };
  }
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("orders")
    .update({ status: outcome })
    .eq("id", orderId)
    .not("status", "in", "(completed,cancelled)");

  if (error) return { ok: false, error: error.message };

  revalidateOrder(orderId);
  return { ok: true };
}

/**
 * Ponowna wysyłka maila "Nowe zlecenie do wyceny" do konkretnego przypisanego studia.
 * Przydatne, gdy studio zmieniło e-mail albo mail nie dotarł.
 * Adres pobierany świeżo z profiles; wpis w email_log jako "assigned_resend".
 */
export async function resendAssignedEmail(
  orderId: string,
  studioId: string
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const out = await sendAssignedEmail(admin, orderId, studioId, { resend: true });
  if (!out.ok) return { ok: false, error: out.error };

  revalidateOrder(orderId);
  if (out.result.status === "sent") {
    return { ok: true, message: `Wysłano ponownie na ${out.recipient}.` };
  }
  if (out.result.status === "skipped") {
    return { ok: false, error: "Wysyłka pominięta — brak klucza Resend na serwerze." };
  }
  return { ok: false, error: `Resend odrzucił wysyłkę: ${out.result.error ?? "nieznany błąd"}` };
}

/**
 * Usunięcie przypisania studia do zlecenia.
 *
 * - Studio "Wybrane" (klient wybrał jego ofertę) nie może być usunięte — najpierw cofnięcie wyniku.
 * - Jeśli studio ma już wycenę albo są wiadomości w rozmowie, bez `force` zwracamy
 *   ostrzeżenie (UI pyta "na pewno?"), z `force` kasujemy wyceny (FK bez kaskady)
 *   i przypisanie. Wiadomości zostają (historia jest niezmienna).
 * - Gdy zniknie ostatnie przypisanie, a zlecenie było "assigned", wraca do "new".
 */
export async function unassignStudio(
  orderId: string,
  studioId: string,
  force = false
): Promise<ActionResult & { needsConfirm?: boolean }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { data: assignment } = await admin
    .from("order_assignments")
    .select("id, status")
    .eq("order_id", orderId)
    .eq("studio_id", studioId)
    .maybeSingle();
  if (!assignment) return { ok: false, error: "To studio nie jest przypisane do zlecenia." };
  if (assignment.status === "chosen") {
    return {
      ok: false,
      error: "Klient wybrał to studio — najpierw cofnij wynik zlecenia, potem usuń przypisanie.",
    };
  }

  const [{ count: quotesCount }, { count: msgCount }] = await Promise.all([
    admin
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("studio_id", studioId),
    admin
      .from("order_messages")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("studio_id", studioId),
  ]);

  const hasHistory = (quotesCount ?? 0) > 0 || (msgCount ?? 0) > 0;
  if (hasHistory && !force) {
    const parts: string[] = [];
    if ((quotesCount ?? 0) > 0) parts.push(`${quotesCount} wycenę/y`);
    if ((msgCount ?? 0) > 0) parts.push(`${msgCount} wiadomości`);
    return {
      ok: false,
      needsConfirm: true,
      error: `To studio ma już ${parts.join(" i ")} przy tym zleceniu. Wyceny zostaną usunięte, wiadomości zostaną w historii. Usunąć mimo to?`,
    };
  }

  if ((quotesCount ?? 0) > 0) {
    const { error: qErr } = await admin
      .from("quotes")
      .delete()
      .eq("order_id", orderId)
      .eq("studio_id", studioId);
    if (qErr) return { ok: false, error: `Nie udało się usunąć wycen: ${qErr.message}` };
  }

  const { error: aErr } = await admin
    .from("order_assignments")
    .delete()
    .eq("id", assignment.id);
  if (aErr) return { ok: false, error: `Nie udało się usunąć przypisania: ${aErr.message}` };

  // Ostatnie przypisanie zniknęło → zlecenie wraca do puli "nowe"
  const { count: left } = await admin
    .from("order_assignments")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  if ((left ?? 0) === 0) {
    await admin
      .from("orders")
      .update({ status: "new", assigned_at: null })
      .eq("id", orderId)
      .eq("status", "assigned");
  }

  revalidateOrder(orderId);
  return { ok: true, message: "Przypisanie usunięte." };
}
