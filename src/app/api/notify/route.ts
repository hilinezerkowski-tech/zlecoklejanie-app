import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Powiadomienia e-mail (Resend) po kluczowych akcjach marketplace'u.
 *
 * POST /api/notify  { type: "assigned" | "quoted" | "chosen", orderId: string }
 *
 * - Adresaci i tresc sa wyprowadzane WYLACZNIE z bazy po orderId — caller nie
 *   moze wskazac dowolnego adresu (ochrona przed spamem przez endpoint).
 * - Wymaga zalogowanego uzytkownika (dowolna rola) — endpoint nie jest publiczny.
 * - Brak RESEND_API_KEY => cichy skip (feature-flag przez env), zeby build
 *   i akcje dzialaly takze bez skonfigurowanego klucza.
 */

const FROM = "ZlecOklejanie.pl <powiadomienia@zlecoklejanie.pl>";
const APP_URL = "https://zlecoklejanie-app.vercel.app";

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[notify] RESEND_API_KEY not set — skipping email:", subject);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    console.error("[notify] Resend error:", res.status, await res.text());
  }
}

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

export async function POST(req: NextRequest) {
  // Autoryzacja: tylko zalogowani uzytkownicy aplikacji
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: { type?: string; orderId?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { type, orderId } = payload;
  if (!type || !orderId || !["assigned", "quoted", "chosen"].includes(type)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Dane zlecenia + klient
  const { data: order } = await admin
    .from("orders")
    .select("id, service_type, car_brand, car_model, city, client_id")
    .eq("id", orderId)
    .single();
  if (!order) {
    return NextResponse.json({ error: "order not found" }, { status: 404 });
  }
  const orderLabel = `${order.car_brand} ${order.car_model} — ${order.city}`;

  try {
    if (type === "assigned") {
      // Mail do NAJNOWIEJ przypisanego studia (wolane tuz po insercie przypisania)
      const { data: assignment } = await admin
        .from("order_assignments")
        .select("studio_id")
        .eq("order_id", orderId)
        .order("assigned_at", { ascending: false })
        .limit(1)
        .single();
      if (assignment) {
        const { data: studio } = await admin
          .from("studios")
          .select("email, business_name")
          .eq("id", assignment.studio_id)
          .single();
        if (studio?.email) {
          await sendEmail(
            studio.email,
            `Nowe zlecenie do wyceny: ${orderLabel}`,
            layout(
              "Masz nowe zlecenie do wyceny",
              `<p>Czesc ${studio.business_name},</p>
               <p>Klient szuka wykonawcy: <strong>${orderLabel}</strong>.</p>
               <p>Zaloguj sie i wyslij wycene — maksymalnie 3 studia dostaja to zapytanie, wiec masz realna szanse.</p>`,
              `${APP_URL}/studio/zlecenia/${order.id}`,
              "Zobacz zlecenie i wycen"
            )
          );
        }
      }
    }

    if (type === "quoted") {
      // Mail do klienta o nowej ofercie
      const { data: client } = await admin
        .from("profiles")
        .select("email")
        .eq("id", order.client_id)
        .single();
      if (client?.email) {
        await sendEmail(
          client.email,
          `Nowa oferta na Twoje zlecenie: ${orderLabel}`,
          layout(
            "Masz nowa oferte od studia",
            `<p>Jedno ze studiow wycenilo Twoje zlecenie <strong>${orderLabel}</strong>.</p>
             <p>Porownaj oferty i wybierz studio, ktore najbardziej Ci odpowiada.</p>`,
            `${APP_URL}/klient/zlecenia/${order.id}`,
            "Zobacz oferty"
          )
        );
      }
    }

    if (type === "chosen") {
      // Maile do wybranego studia (z kontaktem do klienta) i do klienta (z kontaktem do studia)
      const { data: quote } = await admin
        .from("quotes")
        .select("studio_id")
        .eq("order_id", orderId)
        .eq("status", "chosen")
        .limit(1)
        .single();
      const { data: client } = await admin
        .from("profiles")
        .select("email")
        .eq("id", order.client_id)
        .single();
      if (quote) {
        const { data: studio } = await admin
          .from("studios")
          .select("email, business_name, phone")
          .eq("id", quote.studio_id)
          .single();
        if (studio?.email) {
          await sendEmail(
            studio.email,
            `Klient wybral Twoja oferte! ${orderLabel}`,
            layout(
              "Gratulacje — klient wybral Twoje studio",
              `<p>Zlecenie: <strong>${orderLabel}</strong>.</p>
               <p>Kontakt do klienta: <strong>${client?.email ?? "w panelu"}</strong>.</p>
               <p>Skontaktuj sie, ustal termin i szczegoly realizacji.</p>`,
              `${APP_URL}/studio/zlecenia/${order.id}`,
              "Zobacz szczegoly"
            )
          );
        }
        if (client?.email && studio) {
          await sendEmail(
            client.email,
            `Potwierdzenie wyboru studia: ${orderLabel}`,
            layout(
              "Wybrales studio — co dalej?",
              `<p>Twoje zlecenie <strong>${orderLabel}</strong> trafilo do: <strong>${studio.business_name}</strong>.</p>
               <p>Kontakt do studia: <strong>${studio.email}</strong>${studio.phone ? ` / ${studio.phone}` : ""}.</p>
               <p>Studio rowniez dostalo Twoj kontakt i moze odezwac sie pierwsze.</p>`,
              `${APP_URL}/klient/zlecenia/${order.id}`,
              "Zobacz zlecenie"
            )
          );
        }
      }
    }
  } catch (e) {
    console.error("[notify] send failed:", e);
    // Powiadomienia sa best-effort — nie blokujemy akcji uzytkownika
  }

  return NextResponse.json({ ok: true });
}
