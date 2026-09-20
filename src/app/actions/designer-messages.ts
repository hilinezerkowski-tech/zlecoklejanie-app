"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL, emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { etykietaZlecenia } from "@/lib/designer-brief";

export type SendMessageResult = { ok: boolean; error?: string };

/** Minimalny odstęp między mailami „nowa wiadomość" do tej samej osoby w tej samej rozmowie. */
const EMAIL_THROTTLE_MS = 60 * 60 * 1000;

/**
 * Wiadomość w rozmowie klient <-> grafik (lustro sendOrderMessage).
 *
 * Bezpieczeństwo: INSERT idzie sesją użytkownika, więc o tym, czy wolno
 * pisać, decyduje RLS (migracja 015) — nie ten kod. `designerId` od klienta
 * jest tylko kluczem rozmowy; grafik zawsze pisze we własnej.
 */
export async function sendOrderDesignerMessage(
  orderId: string,
  designerIdFromClient: string,
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

  const role =
    me?.role === "designer" ? "designer" : me?.role === "client" ? "client" : null;
  if (!role) return { ok: false, error: "Brak uprawnień do pisania w tej rozmowie." };

  const designerId = role === "designer" ? user.id : designerIdFromClient;

  const { error } = await supabase.from("order_designer_messages").insert({
    order_id: orderId,
    designer_id: designerId,
    sender_id: user.id,
    sender_role: role,
    body,
  });

  if (error) {
    console.warn("[designer-messages] insert failed:", error.message);
    return { ok: false, error: "Nie udało się wysłać. Rozmowa może być już zamknięta." };
  }

  try {
    await notifyOtherSide(orderId, designerId, role, body);
  } catch (e) {
    console.warn("[designer-messages] notify failed:", e);
  }

  revalidatePath(`/klient/zlecenia/${orderId}`);
  revalidatePath("/grafik/briefy");
  revalidatePath(`/admin/zlecenia/${orderId}`);
  return { ok: true };
}

async function notifyOtherSide(
  orderId: string,
  designerId: string,
  senderRole: "client" | "designer",
  body: string
) {
  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("id, car_brand, car_model, city, client_id")
    .eq("id", orderId)
    .single();
  if (!order) return;

  const recipientId = senderRole === "client" ? designerId : order.client_id;
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
    .eq("event", "designer_message")
    .eq("order_id", orderId)
    .eq("recipient", recipient.email)
    .eq("status", "sent")
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) return;

  const { data: designer } = await admin
    .from("designers")
    .select("display_name")
    .eq("id", designerId)
    .single();

  const label = etykietaZlecenia(order);
  const from = senderRole === "client" ? "Klient" : designer?.display_name || "Grafik";
  const preview = body.length > 300 ? `${body.slice(0, 300)}…` : body;
  const url =
    senderRole === "client"
      ? `${APP_URL}/grafik/briefy`
      : `${APP_URL}/klient/zlecenia/${orderId}`;

  await sendEmail(
    recipient.email,
    `Nowa wiadomość: ${label}`,
    emailLayout({
      title: `${escapeHtml(from)} napisał(a) do Ciebie`,
      body: `<p>Zlecenie: <strong>${escapeHtml(label)}</strong></p>
        <blockquote style="margin:12px 0;padding:12px 16px;background:#f4f6f2;border-left:3px solid #a3c644;white-space:pre-wrap;">${escapeHtml(preview)}</blockquote>`,
      ctaUrl: url,
      ctaLabel: "Odpowiedz w panelu",
      footer:
        "Logowanie bez hasła — na stronie logowania podaj swój e-mail, wyślemy link. Kolejne wiadomości w ciągu godziny nie generują osobnych maili.",
    }),
    {
      log: {
        event: "designer_message",
        recipientRole: senderRole === "client" ? "designer" : "client",
        orderId,
      },
    }
  );
}
