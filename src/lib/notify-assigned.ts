import { APP_URL, sendEmailResult, type SendEmailResult } from "@/lib/email";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mail "Nowe zlecenie do wyceny" do konkretnego studia przypisanego do zlecenia.
 *
 * Jedno miejsce dla dwóch ścieżek:
 *  - pierwsze przypisanie (POST /api/notify, type "assigned"),
 *  - ponowna wysyłka z panelu admina (server action resendAssignedEmail),
 * żeby treść i logowanie do email_log nigdy się nie rozjechały.
 *
 * Adres studia jest czytany z profiles W MOMENCIE wysyłki (studios.id === profiles.id),
 * więc po zmianie e-maila studia w panelu ponowna wysyłka idzie na nowy adres.
 */

function layout(title: string, body: string, ctaUrl: string, ctaLabel: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a;">
    <p style="font-size:20px;font-weight:800;margin:0 0 16px;">zlec<span style="color:#a3c644;">oklejanie</span>.pl</p>
    <h2 style="font-size:18px;margin:0 0 12px;">${title}</h2>
    <div style="font-size:14px;line-height:1.6;">${body}</div>
    <p style="margin:24px 0;">
      <a href="${ctaUrl}" style="background:#c6f232;color:#1a1a1a;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700;">${ctaLabel}</a>
    </p>
    <p style="font-size:12px;color:#888;">Logowanie bez hasla — na stronie logowania podaj swoj e-mail, wyslemy link.</p>
  </div>`;
}

export type AssignedEmailOutcome =
  | { ok: true; recipient: string; result: SendEmailResult }
  | { ok: false; error: string };

export async function sendAssignedEmail(
  admin: SupabaseClient,
  orderId: string,
  studioId: string,
  opts: { resend?: boolean } = {}
): Promise<AssignedEmailOutcome> {
  const { data: order } = await admin
    .from("orders")
    .select("id, car_brand, car_model, city")
    .eq("id", orderId)
    .single();
  if (!order) return { ok: false, error: "Nie znaleziono zlecenia." };

  // Wysyłamy tylko do studia faktycznie przypisanego do TEGO zlecenia
  const { data: assignment } = await admin
    .from("order_assignments")
    .select("id")
    .eq("order_id", orderId)
    .eq("studio_id", studioId)
    .maybeSingle();
  if (!assignment) return { ok: false, error: "To studio nie jest przypisane do zlecenia." };

  const { data: studio } = await admin
    .from("studios")
    .select("business_name")
    .eq("id", studioId)
    .single();
  const { data: studioProfile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", studioId)
    .single();
  if (!studioProfile?.email) return { ok: false, error: "Studio nie ma adresu e-mail w profilu." };

  // Null-safe: zlecenia bez danych auta (np. sama grafika) nie mogą dawać "null null — Warszawa"
  const carPart = [order.car_brand, order.car_model].filter(Boolean).join(" ");
  const orderLabel = carPart ? `${carPart} — ${order.city}` : `${order.city}`;

  const result = await sendEmailResult(
    studioProfile.email,
    `Nowe zlecenie do wyceny: ${orderLabel}`,
    layout(
      "Masz nowe zlecenie do wyceny",
      `<p>Czesc ${studio?.business_name ?? ""},</p>
       <p>Klient szuka wykonawcy: <strong>${orderLabel}</strong>.</p>
       <p>Zaloguj sie i wyslij wycene — maksymalnie 3 studia dostaja to zapytanie, wiec masz realna szanse.</p>`,
      `${APP_URL}/studio/zlecenia/${order.id}`,
      "Zobacz zlecenie i wycen"
    ),
    {
      log: {
        // Osobne zdarzenie dla ponownej wysyłki — w historii powiadomień widać, że to resend
        event: opts.resend ? "assigned_resend" : "assigned",
        recipientRole: "studio",
        orderId: order.id,
      },
    }
  );

  return { ok: true, recipient: studioProfile.email, result };
}
