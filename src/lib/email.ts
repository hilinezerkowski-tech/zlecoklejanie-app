/**
 * Wspólna warstwa wysyłki e-mail (Resend).
 *
 * Powód istnienia: ten sam nagłówek, ten sam layout i ta sama obsługa braku
 * klucza API były kopiowane w /api/notify i /api/lead-alert. Nowe powiadomienia
 * (autoresponder do zgłaszającego, powitanie studia) korzystają już stąd.
 *
 * Zasada bezpieczeństwa: adresat ZAWSZE wyprowadzany z bazy lub z zaufanego
 * kontekstu serwera — nigdy bezpośrednio z ciała żądania HTTP.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export const EMAIL_FROM =
  "ZlecOklejanie.pl <powiadomienia@zlecoklejanie.pl>";

/** Adres aplikacji (panel). Fallback na domenę Vercela, gdy brak env. */
export const APP_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://zlecoklejanie-app.vercel.app";

/** Adres strony ofertowej (landing na Netlify). */
export const SITE_URL = "https://zlecoklejanie.pl";

/** Escapowanie wartości użytkownika wstawianych do HTML maila. */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Prosta walidacja adresu — chroni przed wysyłką na śmieciowy wpis z formularza. */
export function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim());
}

type LayoutOptions = {
  title: string;
  /** Gotowy HTML treści (akapity). Wartości od użytkownika muszą być już zescapowane. */
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
  /** Drobny tekst pod przyciskiem. */
  footer?: string;
};

/** Wspólny szablon maila w kolorystyce marki. */
export function emailLayout({
  title,
  body,
  ctaUrl,
  ctaLabel,
  footer,
}: LayoutOptions): string {
  const cta =
    ctaUrl && ctaLabel
      ? `<p style="margin:24px 0;">
      <a href="${ctaUrl}" style="background:#c6f232;color:#1a1a1a;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block;">${ctaLabel}</a>
    </p>`
      : "";

  const foot = footer
    ? `<p style="font-size:12px;color:#888;line-height:1.5;">${footer}</p>`
    : "";

  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
    <p style="font-size:20px;font-weight:800;margin:0 0 16px;">zlec<span style="color:#a3c644;">oklejanie</span>.pl</p>
    <h2 style="font-size:18px;margin:0 0 12px;">${title}</h2>
    <div style="font-size:14px;line-height:1.6;">${body}</div>
    ${cta}
    ${foot}
  </div>`;
}

/** Metadane do historii powiadomień (tabela email_log). */
export type EmailLogMeta = {
  event: string;
  recipientRole?: "client" | "studio" | "designer" | "admin" | "lead";
  orderId?: string | null;
  leadId?: string | null;
};

/**
 * Zapis próby wysyłki do email_log. Best-effort: błąd zapisu logu
 * NIGDY nie przerywa wysyłki ani akcji użytkownika.
 */
async function writeEmailLog(
  meta: EmailLogMeta,
  to: string,
  subject: string,
  status: "sent" | "failed" | "skipped",
  providerId?: string | null,
  error?: string | null
) {
  try {
    const admin = createAdminClient();
    const { error: dbErr } = await admin.from("email_log").insert({
      event: meta.event,
      recipient: to,
      recipient_role: meta.recipientRole ?? null,
      order_id: meta.orderId ?? null,
      lead_id: meta.leadId ?? null,
      subject,
      status,
      provider_id: providerId ?? null,
      // Przycinamy — treść błędu Resend bywa długa, a to tylko podgląd
      error: error ? error.slice(0, 500) : null,
    });
    if (dbErr) console.warn("[email] log insert failed:", dbErr.message);
  } catch (e) {
    console.warn("[email] log write threw:", e);
  }
}

/** Nadawca wiadomości pisanych ręcznie przez admina (odpowiedzi trafiają do skrzynki kontaktowej). */
export const EMAIL_FROM_KONTAKT =
  "ZlecOklejanie.pl <kontakt@zlecoklejanie.pl>";

export type SendEmailResult = {
  status: "sent" | "failed" | "skipped";
  error?: string;
};

type SendEmailOptions = { replyTo?: string; from?: string; log?: EmailLogMeta };

/**
 * Wysyłka przez Resend ze szczegółowym wynikiem. Brak RESEND_API_KEY =>
 * 'skipped' (feature flag), żeby build i akcje działały także bez klucza.
 *
 * Gdy podano `opts.log`, wynik (sent/failed/skipped) trafia do historii
 * powiadomień widocznej w panelu admina.
 */
export async function sendEmailResult(
  to: string,
  subject: string,
  html: string,
  opts?: SendEmailOptions
): Promise<SendEmailResult> {
  const log = opts?.log;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skipping:", subject);
    if (log) await writeEmailLog(log, to, subject, "skipped", null, "Brak RESEND_API_KEY");
    return { status: "skipped", error: "Brak RESEND_API_KEY" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: opts?.from || EMAIL_FROM,
        to: [to],
        subject,
        html,
        ...(opts?.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[email] Resend error:", res.status, errText);
      const error = `HTTP ${res.status}: ${errText}`;
      if (log) await writeEmailLog(log, to, subject, "failed", null, error);
      return { status: "failed", error };
    }

    // Resend zwraca { id } — zapisujemy, żeby dało się znaleźć mail w ich logach
    let providerId: string | null = null;
    try {
      providerId = ((await res.json()) as { id?: string })?.id ?? null;
    } catch {
      /* brak JSON — nie szkodzi */
    }
    if (log) await writeEmailLog(log, to, subject, "sent", providerId);
    return { status: "sent" };
  } catch (e) {
    console.error("[email] send failed:", e);
    if (log) await writeEmailLog(log, to, subject, "failed", null, String(e));
    return { status: "failed", error: String(e) };
  }
}

/** Skrót: true tylko przy potwierdzonym przyjęciu maila przez Resend. */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  opts?: SendEmailOptions
): Promise<boolean> {
  return (await sendEmailResult(to, subject, html, opts)).status === "sent";
}
