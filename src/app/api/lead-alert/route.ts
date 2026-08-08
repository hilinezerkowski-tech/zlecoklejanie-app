import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Alert e-mail do admina o nowym leadzie z landing page.
 *
 * Wolany przez Supabase Database Webhook (INSERT na landing_leads).
 * Payload webhooka: { type: "INSERT", table: "landing_leads", record: {...} }
 * Akceptujemy tez { leadId: "..." } do recznego wyzwolenia.
 *
 * BEZPIECZENSTWO — endpoint jest publiczny (webhook nie wysyla naglowkow
 * autoryzacyjnych), wiec zamiast sekretu ograniczamy to, co da sie nim zrobic:
 *  - adres odbiorcy jest STALY (admin), nie pochodzi z requestu,
 *  - tresc pochodzi wylacznie z bazy, po ID — caller nie wstrzyknie tekstu,
 *  - wysylamy tylko dla leada o statusie 'new' i mlodszego niz 10 minut,
 *    wiec nie da sie odpalac powiadomien w kolko dla starych rekordow.
 * Najgorszy scenariusz naduzycia: jednorazowy mail o realnym, swiezym leadzie.
 */

const FROM = "ZlecOklejanie.pl <powiadomienia@zlecoklejanie.pl>";
// UWAGA: kontakt@zlecoklejanie.pl NIE ma skrzynki odbiorczej — rekord MX domeny
// obsluguje tylko bounce z Resend przy wysylce. Alerty ida na adres, ktory
// realnie czytamy. Mozna nadpisac zmienna ADMIN_ALERT_EMAIL w Vercelu.
const ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL || "hiline.zerkowski@gmail.com";
const APP_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://zlecoklejanie-app.vercel.app";

const MAX_AGE_MS = 10 * 60 * 1000;

const kindLabels: Record<string, string> = {
  zlecenie: "klient szuka wykonawcy",
  studio: "studio chce dolaczyc",
  grafik: "grafik chce dolaczyc",
};

const fieldLabels: Record<string, string> = {
  usluga: "Usluga",
  auto: "Auto",
  miasto: "Miasto",
  szczegoly: "Szczegoly",
  potrzebuje_grafika: "Potrzebuje grafika",
  nazwa: "Nazwa",
  instagram: "Instagram",
  portfolio: "Portfolio",
  specjalizacja: "Specjalizacja",
  email: "E-mail",
  telefon: "Telefon",
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const leadId: string | undefined = body?.record?.id || body?.leadId;
  if (!leadId) {
    return NextResponse.json({ error: "no lead id" }, { status: 400 });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[lead-alert] RESEND_API_KEY not set — skipping");
    return NextResponse.json({ ok: true, skipped: "no api key" });
  }

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("landing_leads")
    .select("id, kind, payload, status, created_at")
    .eq("id", leadId)
    .single();

  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Anty-naduzycie: tylko swieze, nieobsluzone leady.
  if (lead.status !== "new") {
    return NextResponse.json({ ok: true, skipped: "not new" });
  }
  if (Date.now() - new Date(lead.created_at).getTime() > MAX_AGE_MS) {
    return NextResponse.json({ ok: true, skipped: "too old" });
  }

  const p = (lead.payload || {}) as Record<string, string>;
  const rows = Object.entries(p)
    .filter(([, v]) => v && String(v).trim())
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;vertical-align:top;">${escapeHtml(
          fieldLabels[k] || k
        )}</td><td style="padding:4px 0;"><strong>${escapeHtml(
          String(v)
        )}</strong></td></tr>`
    )
    .join("");

  const kindLabel = kindLabels[lead.kind] || lead.kind;
  const subject = `Nowy lead (${lead.kind}): ${p.nazwa || p.auto || p.miasto || p.email || ""}`.trim();

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
    <p style="font-size:20px;font-weight:800;margin:0 0 16px;">zlec<span style="color:#a3c644;">oklejanie</span>.pl</p>
    <h2 style="font-size:18px;margin:0 0 4px;">Nowe zgloszenie z formularza</h2>
    <p style="font-size:14px;color:#666;margin:0 0 16px;">Typ: ${escapeHtml(kindLabel)}</p>
    <table style="font-size:14px;line-height:1.5;border-collapse:collapse;">${rows}</table>
    <p style="margin:24px 0;">
      <a href="${APP_URL}/admin/leady?status=new" style="background:#c6f232;color:#1a1a1a;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700;">Otworz skrzynke leadow</a>
    </p>
    <p style="font-size:12px;color:#888;">Lead klienta zamienisz na zlecenie jednym kliknieciem w panelu.</p>
  </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [ADMIN_EMAIL],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error("[lead-alert] Resend error:", res.status, await res.text());
    }
  } catch (e) {
    console.error("[lead-alert] send failed:", e);
  }

  return NextResponse.json({ ok: true });
}
