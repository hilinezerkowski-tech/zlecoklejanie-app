import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_URL, sendEmail } from "@/lib/email";

/**
 * Mail „Nowa oferta na Twoje zlecenie” do klienta + magic link do panelu klienta.
 * Jedno miejsce dla dwóch ścieżek: wycena z panelu studia (POST /api/notify, type "quoted")
 * i wycena z linku tokenowego /o/<token> (src/app/o/[token]/actions.ts).
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

// Magic-link do panelu klienta: klient bez hasla wchodzi jednym kliknieciem.
// generateLink zwraca hashed_token wymieniany na sesje w /auth/confirm; wygasa
// ~1h — po tym czasie link prowadzi do /login (klient poprosi o nowy). Fallback
// na goly URL, gdy generateLink zawiedzie.
export async function clientMagicLink(admin: SupabaseClient, email: string, nextPath: string): Promise<string> {
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const hashed = data?.properties?.hashed_token;
    if (!error && hashed) {
      return (
        `${APP_URL}/auth/confirm?token_hash=${encodeURIComponent(hashed)}` +
        `&type=magiclink&next=${encodeURIComponent(nextPath)}`
      );
    }
  } catch {
    /* fallback ponizej */
  }
  return `${APP_URL}${nextPath}`;
}

export async function sendQuotedEmail(admin: SupabaseClient, orderId: string): Promise<void> {
  const { data: order } = await admin
    .from("orders")
    .select("id, car_brand, car_model, city, client_id")
    .eq("id", orderId)
    .single();
  if (!order) return;
  // Null-safe: zlecenia bez danych auta nie mogą dawać tematów typu "null null — Warszawa"
  const carPart = [order.car_brand, order.car_model].filter(Boolean).join(" ");
  const orderLabel = carPart ? `${carPart} — ${order.city}` : `${order.city}`;

  const { data: client } = await admin.from("profiles").select("email").eq("id", order.client_id).single();
  if (!client?.email) return;
  await sendEmail(
    client.email,
    `Nowa oferta na Twoje zlecenie: ${orderLabel}`,
    layout(
      "Masz nowa oferte od studia",
      `<p>Jedno ze studiow wycenilo Twoje zlecenie <strong>${orderLabel}</strong>.</p>
             <p>Porownaj oferty i wybierz studio, ktore najbardziej Ci odpowiada.</p>`,
      await clientMagicLink(admin, client.email, `/klient/zlecenia/${order.id}`),
      "Zobacz oferty"
    ),
    { log: { event: "quoted", recipientRole: "client", orderId: order.id } }
  );
}
