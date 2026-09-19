"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL, emailLayout, escapeHtml, sendEmail } from "@/lib/email";

export type SendMessageResult = { ok: boolean; error?: string };

/** Minimalny odstęp między mailami "nowa wiadomość" do tej samej osoby w tej samej rozmowie. */
const EMAIL_THROTTLE_MS = 60 * 60 * 1000;

/**
 * Wysyła wiadomość w rozmowie (zlecenie + studio).
 *
 * Bezpieczeństwo: INSERT idzie klientem Supabase z sesją użytkownika, więc
 * o tym, czy wolno pisać, decyduje RLS (migracja 012) — nie ten kod.
 * `studioId` od klienta jest tylko kluczem rozmowy; studio zawsze pisze
 * we własnej rozmowie (studioId = jego id).
 */
export async function sendOrderMessage(
  orderId: string,
  studioIdFromClient: string,
  rawBody: string
): Promise<SendMessageResult> {
  const body = (rawBody || "").trim();
  if (!body) return { ok: false, error: "Wiadomość jest pusta." };
  if (body.length > 4000) return { ok: false, error: "Wiadomość jest za długa (max 4000 znaków)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Brak sesji — zaloguj się ponownie." };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = me?.role === "studio" ? "studio" : me?.role === "client" ? "client" : null;
  if (!role) return { ok: false, error: "Brak uprawnień do pisania w tej rozmowie." };

  const studioId = role === "studio" ? user.id : studioIdFromClient;

  const { error } = await supabase.from("order_messages").insert({
    order_id: orderId,
    studio_id: studioId,
    sender_id: user.id,
    sender_role: role,
    body,
  });

  if (error) {
    console.warn("[messages] insert failed:", error.message);
    return { ok: false, error: "Nie udało się wysłać. Rozmowa może być już zamknięta." };
  }

  // Powiadomienie drugiej strony — best-effort, błąd nie cofa wiadomości
  try {
    await notifyOtherSide(orderId, studioId, role, body);
  } catch (e) {
    console.warn("[messages] notify failed:", e);
  }

  revalidatePath(`/klient/zlecenia/${orderId}`);
  revalidatePath(`/studio/zlecenia/${orderId}`);
  revalidatePath(`/admin/zlecenia/${orderId}`);
  return { ok: true };
}

async function notifyOtherSide(
  orderId: string,
  studioId: string,
  senderRole: "client" | "studio",
  body: string
) {
  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("id, car_brand, car_model, city, client_id")
    .eq("id", orderId)
    .single();
  if (!order) return;

  const recipientId = senderRole === "client" ? studioId : order.client_id;
  const { data: recipient } = await admin
    .from("profiles")
    .select("email")
    .eq("id", recipientId)
    .single();
  if (!recipient?.email) return;

  // Throttling: max 1 mail o wiadomościach na godzinę do tej osoby w tym zleceniu
  const since = new Date(Date.now() - EMAIL_THROTTLE_MS).toISOString();
  const { data: recent } = await admin
    .from("email_log")
    .select("id")
    .eq("event", "message")
    .eq("order_id", orderId)
    .eq("recipient", recipient.email)
    .eq("status", "sent")
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) return;

  const { data: studio } = await admin
    .from("studios")
    .select("business_name")
    .eq("id", studioId)
    .single();

  const carPart = [order.car_brand, order.car_model].filter(Boolean).join(" ");
  const orderLabel = carPart ? `${carPart} — ${order.city}` : order.city;
  const from = senderRole === "client" ? "Klient" : studio?.business_name || "Studio";
  const preview = body.length > 300 ? `${body.slice(0, 300)}…` : body;
  const url =
    senderRole === "client"
      ? `${APP_URL}/studio/zlecenia/${orderId}`
      : `${APP_URL}/klient/zlecenia/${orderId}`;

  await sendEmail(
    recipient.email,
    `Nowa wiadomość: ${orderLabel}`,
    emailLayout({
      title: `${escapeHtml(from)} napisał(a) do Ciebie`,
      body: `<p>Zlecenie: <strong>${escapeHtml(orderLabel)}</strong></p>
        <blockquote style="margin:12px 0;padding:12px 16px;background:#f4f6f2;border-left:3px solid #a3c644;white-space:pre-wrap;">${escapeHtml(preview)}</blockquote>`,
      ctaUrl: url,
      ctaLabel: "Odpowiedz w panelu",
      footer:
        "Logowanie bez hasła — na stronie logowania podaj swój e-mail, wyślemy link. Kolejne wiadomości w ciągu godziny nie generują osobnych maili.",
    }),
    {
      log: {
        event: "message",
        recipientRole: senderRole === "client" ? "studio" : "client",
        orderId,
      },
    }
  );
}
