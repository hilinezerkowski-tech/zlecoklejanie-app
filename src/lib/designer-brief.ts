import { APP_URL, escapeHtml, sendEmailResult, type SendEmailResult } from "@/lib/email";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Brief dla grafika — jedno miejsce na tresc domyslna i na wysylke maila.
 *
 * ZASADA RODO (Faza 1): grafik NIE dostaje danych kontaktowych klienta.
 * Laczy ich admin. Dlatego:
 *  - grafik nie ma dostepu do tabeli `orders` (brak polityki RLS),
 *  - dostaje wylacznie tresc briefu zapisana w order_designer_assignments,
 *  - domyslny brief jest czyszczony z linii wygladajacych na kontakt
 *    (`convertLeadToOrder` dopisuje do opisu m.in. "Telefon: ...").
 */

const SERVICE_LABELS: Record<string, string> = {
  oklejanie: "Oklejanie",
  ppf: "Folia PPF",
  branding: "Branding / reklama na aucie",
  grafika: "Projekt graficzny",
  inne: "Inne",
};

const SCOPE_LABELS: Record<string, string> = {
  full: "całe auto",
  full_wneki: "całe auto + wnęki",
  partial: "część auta",
  front: "przód",
};

/** Linia wyglądająca na dane kontaktowe klienta — nie trafia do briefu. */
function toKontakt(linia: string): boolean {
  const l = linia.toLowerCase();
  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(linia)) return true;
  if (/^\s*(telefon|tel\.?|kontakt|e-?mail|mail)\s*[:\-]/i.test(l)) return true;
  // 9+ cyfr z ewentualnymi spacjami/myślnikami = numer telefonu
  if (/(?:\+?\d[\s-]?){9,}/.test(linia)) return true;
  return false;
}

export type BriefOrder = {
  service_type: string;
  car_brand: string | null;
  car_model: string | null;
  car_year: number | null;
  scope: string | null;
  city: string | null;
  description: string | null;
};

/** Krótki opis zlecenia do nagłówków i tematu maila, np. "BMW X6 — Gorzów". */
export function etykietaZlecenia(o: {
  car_brand: string | null;
  car_model: string | null;
  city: string | null;
}): string {
  const auto = [o.car_brand, o.car_model].filter(Boolean).join(" ");
  return [auto, o.city].filter(Boolean).join(" — ") || "zlecenie";
}

/**
 * Domyślna treść briefu — admin może ją dowolnie zmienić przed wysyłką.
 * Świadomie pomija wszystko, co wygląda na kontakt do klienta.
 */
export function domyslnyBrief(o: BriefOrder): string {
  const linie: string[] = [];
  linie.push(`Usługa: ${SERVICE_LABELS[o.service_type] || o.service_type}`);

  const auto = [o.car_brand, o.car_model, o.car_year].filter(Boolean).join(" ");
  if (auto) linie.push(`Pojazd: ${auto}`);
  if (o.scope) linie.push(`Zakres: ${SCOPE_LABELS[o.scope] || o.scope}`);
  if (o.city) linie.push(`Lokalizacja: ${o.city}`);

  const opis = (o.description || "")
    .split("\n")
    .filter((l) => l.trim() && !toKontakt(l))
    .join("\n")
    .trim();
  if (opis) linie.push("", "Czego potrzebuje klient:", opis);

  return linie.join("\n");
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

export type BriefEmailOutcome =
  | { ok: true; recipient: string; result: SendEmailResult }
  | { ok: false; error: string };

/**
 * Wysyła brief do grafika. Adres czytany z `profiles` w momencie wysyłki
 * (designers.id === profiles.id), nigdy z formularza.
 */
export async function sendDesignerBrief(
  admin: SupabaseClient,
  params: {
    orderId: string;
    designerId: string;
    brief: string;
    orderLabel: string;
    resend?: boolean;
  }
): Promise<BriefEmailOutcome> {
  const { data: designer } = await admin
    .from("designers")
    .select("display_name")
    .eq("id", params.designerId)
    .single();

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", params.designerId)
    .single();
  if (!profile?.email) return { ok: false, error: "Grafik nie ma adresu e-mail w profilu." };

  const result = await sendEmailResult(
    profile.email,
    `Nowy brief: ${params.orderLabel}`,
    layout(
      "Masz nowy brief do wyceny",
      `<p>Cześć ${escapeHtml(designer?.display_name ?? "")},</p>
       <p>Klient szuka grafika: <strong>${escapeHtml(params.orderLabel)}</strong>.</p>
       <div style="background:#f4f4f4;border-radius:10px;padding:14px;white-space:pre-wrap;">${escapeHtml(params.brief)}</div>
       <p>Wejdź do panelu i odpowiedz, czy bierzesz ten projekt. Jeśli tak — skontaktujemy Cię z klientem.</p>`,
      `${APP_URL}/grafik/briefy`,
      "Zobacz brief i odpowiedz"
    ),
    {
      log: {
        event: params.resend ? "designer_brief_resend" : "designer_brief",
        recipientRole: "designer",
        orderId: params.orderId,
      },
    }
  );

  return { ok: true, recipient: profile.email, result };
}
