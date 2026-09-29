// SMS przez SMSAPI.pl (REST). Adapter opcjonalny: brak SMSAPI_TOKEN = SMS pomijany,
// wszystko działa mailowo. Konto SMSAPI zakłada Wojtek; nadawca w SMS_SENDER.
// Każda próba trafia do email_log z kanałem 'sms'.

import { writeEmailLog, type EmailLogMeta } from "@/lib/email";

/** Numer → +48XXXXXXXXX albo null, gdy nie wygląda na polski numer. */
export function normalizujTelefon(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cyfry = raw.replace(/\D/g, "");
  if (/^\d{9}$/.test(cyfry)) return `+48${cyfry}`;
  if (/^48\d{9}$/.test(cyfry)) return `+${cyfry}`;
  if (/^0048\d{9}$/.test(cyfry)) return `+${cyfry.slice(2)}`;
  return null;
}

export type SmsWynik = { status: "sent" | "failed" | "skipped"; error?: string };

export async function sendSms(to: string | null | undefined, text: string, log?: EmailLogMeta): Promise<SmsWynik> {
  const numer = normalizujTelefon(to);
  if (!numer) return { status: "skipped", error: "Brak poprawnego numeru" };
  const token = process.env.SMSAPI_TOKEN;
  if (!token) return { status: "skipped", error: "Brak SMSAPI_TOKEN" };

  const meta = log ? { ...log, channel: "sms" as const } : null;
  try {
    const body = new URLSearchParams({
      to: numer.replace("+", ""),
      message: text.slice(0, 450),
      format: "json",
      encoding: "utf-8",
    });
    if (process.env.SMS_SENDER) body.set("from", process.env.SMS_SENDER);
    const res = await fetch("https://api.smsapi.pl/sms.do", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as { error?: number; message?: string; list?: { id?: string }[] };
    if (!res.ok || json.error) {
      const error = `SMSAPI ${res.status}: ${json.message ?? json.error ?? "błąd"}`;
      if (meta) await writeEmailLog(meta, numer, text, "failed", null, error);
      return { status: "failed", error };
    }
    if (meta) await writeEmailLog(meta, numer, text, "sent", json.list?.[0]?.id ?? null);
    return { status: "sent" };
  } catch (e) {
    const error = String(e);
    if (meta) await writeEmailLog(meta, numer, text, "failed", null, error);
    return { status: "failed", error };
  }
}
