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

/**
 * Wysyłka przez Resend. Brak RESEND_API_KEY => cichy skip (feature flag),
 * żeby build i akcje działały także bez skonfigurowanego klucza.
 * Zwraca true tylko przy potwierdzonym przyjęciu przez Resend.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  opts?: { replyTo?: string }
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skipping:", subject);
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        html,
        ...(opts?.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      console.error("[email] Resend error:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] send failed:", e);
    return false;
  }
}
