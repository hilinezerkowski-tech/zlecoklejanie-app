// Doładowanie punktów przez Przelewy24 (Gate 1, Faza 2). Tylko serwer.
//
// Przebieg: utworzPlatnosc → wiersz `platnosci` ('oczekuje', sessionId = id wiersza) → rejestracja
// w P24 → studio płaci na stronie P24 → P24 woła /api/p24/webhook → obsluzPowiadomienie sprawdza
// podpis, kwotę i wiersz z bazy, robi PUT /transaction/verify i dopiero wtedy zaksieguj_platnosc()
// (migracja 034) dopisuje punkty. Kwota i liczba punktów zawsze z bazy, nigdy z żądania.
// Faktury (decyzja 20.11.2026): na start ręcznie — po wpłacie admin dostaje mail z danymi do faktury.

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_URL, escapeHtml, sendEmail } from "@/lib/email";
import { pobierzUstawieniaPunktow, punktyTxt } from "@/lib/punkty";
import {
  p24Konfiguracja,
  podpisPowiadomieniaOk,
  weryfikujTransakcje,
  zarejestrujTransakcje,
  type PowiadomienieP24,
} from "@/lib/p24";

const ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL || "zlecoklejaniepl@gmail.com";

export type WynikPlatnosci = { ok: true; link: string } | { ok: false; error: string };

/** Czy doładowanie jest dostępne: klucze P24 + pakiet ustawiony przez admina. */
export async function doladowanieDostepne(admin: SupabaseClient): Promise<boolean> {
  if (!p24Konfiguracja()) return false;
  const u = await pobierzUstawieniaPunktow(admin);
  return Boolean(u.pakietPunkty && u.pakietCenaZl);
}

/** Zakłada płatność za pakiet punktów i zwraca link do P24. studioId — tylko z zaufanego kontekstu. */
export async function utworzPlatnosc(admin: SupabaseClient, studioId: string, urlReturn: string): Promise<WynikPlatnosci> {
  const k = p24Konfiguracja();
  if (!k) return { ok: false, error: "Płatności online nie są jeszcze uruchomione." };
  const u = await pobierzUstawieniaPunktow(admin);
  if (!u.pakietPunkty || !u.pakietCenaZl) return { ok: false, error: "Pakiet punktów nie jest jeszcze w sprzedaży." };

  const [{ data: studio }, { data: profil }] = await Promise.all([
    admin.from("studios").select("id, status, business_name").eq("id", studioId).maybeSingle(),
    admin.from("profiles").select("email").eq("id", studioId).maybeSingle(),
  ]);
  if (!studio || studio.status !== "active") return { ok: false, error: "Konto studia nie jest aktywne." };
  if (!profil?.email) return { ok: false, error: "Konto nie ma adresu e-mail — napisz do nas." };

  // sessionId = id wiersza, zapisany od razu — webhook zawsze znajdzie płatność.
  const sessionId = randomUUID();
  const { error } = await admin.from("platnosci").insert({
    id: sessionId,
    studio_id: studioId,
    kwota: u.pakietCenaZl,
    punkty_kupione: u.pakietPunkty,
    status: "oczekuje",
    p24_session_id: sessionId,
  });
  if (error) return { ok: false, error: "Nie udało się rozpocząć płatności (migracja 033?)." };

  const reg = await zarejestrujTransakcje(k, {
    sessionId,
    amount: Math.round(u.pakietCenaZl * 100),
    description: `ZlecOklejanie.pl - ${punktyTxt(u.pakietPunkty)} na wyceny`,
    email: profil.email,
    urlReturn,
    urlStatus: `${APP_URL}/api/p24/webhook`,
  });
  if (!reg.ok) {
    await admin.from("platnosci").update({ status: "blad" }).eq("id", sessionId);
    await admin.from("admin_actions").insert({
      admin_id: null,
      entity: "punkty",
      action: "platnosc_start",
      entity_id: studioId,
      payload: { platnoscId: sessionId },
      result: "error",
      error: reg.error,
    });
    return { ok: false, error: "Przelewy24 nie przyjęły płatności. Spróbuj za chwilę." };
  }
  return { ok: true, link: reg.link };
}

export type WynikPowiadomienia = { status: number; komunikat: string };

/** Obsługa powiadomienia z P24 (urlStatus). Zwraca kod HTTP dla P24. */
export async function obsluzPowiadomienie(admin: SupabaseClient, n: PowiadomienieP24): Promise<WynikPowiadomienia> {
  const k = p24Konfiguracja();
  if (!k) return { status: 503, komunikat: "p24 nieskonfigurowane" };
  if (!n || typeof n.sessionId !== "string") return { status: 400, komunikat: "zle dane" };
  if (n.merchantId !== k.merchantId || n.posId !== k.posId || !podpisPowiadomieniaOk(k, n)) {
    await logBledu(admin, null, n.sessionId, "zly podpis lub merchant");
    return { status: 400, komunikat: "zly podpis" };
  }

  const { data: p } = await admin
    .from("platnosci")
    .select("id, studio_id, kwota, punkty_kupione, status")
    .eq("p24_session_id", n.sessionId)
    .maybeSingle();
  if (!p) return { status: 404, komunikat: "brak platnosci" };
  if (p.status === "zaplacono") return { status: 200, komunikat: "juz zaksiegowana" };

  const kwotaGr = Math.round(Number(p.kwota) * 100);
  if (n.amount !== kwotaGr || n.currency !== "PLN") {
    await logBledu(admin, p.studio_id, n.sessionId, `kwota ${n.amount} ${n.currency} ≠ ${kwotaGr} PLN`);
    return { status: 400, komunikat: "zla kwota" };
  }

  const ver = await weryfikujTransakcje(k, { sessionId: n.sessionId, orderId: n.orderId, amount: kwotaGr });
  if (!ver.ok) {
    await logBledu(admin, p.studio_id, n.sessionId, ver.error ?? "verify");
    return { status: 502, komunikat: "verify nieudane" }; // P24 ponowi powiadomienie
  }

  const { data: wynik, error } = await admin.rpc("zaksieguj_platnosc", { p_platnosc: p.id, p_p24_order_id: n.orderId });
  if (error) {
    await logBledu(admin, p.studio_id, n.sessionId, `zaksieguj_platnosc: ${error.message}`);
    return { status: 500, komunikat: "blad ksiegowania" };
  }
  if ((wynik as { zaksiegowano?: boolean } | null)?.zaksiegowano) {
    await mailDoFaktury(admin, p.studio_id, Number(p.kwota), p.punkty_kupione, n.orderId).catch((e) =>
      console.error("[p24] mail do faktury:", e)
    );
  }
  return { status: 200, komunikat: "ok" };
}

async function logBledu(admin: SupabaseClient, studioId: string | null, sessionId: string, blad: string) {
  await admin.from("admin_actions").insert({
    admin_id: null,
    entity: "punkty",
    action: "platnosc_p24",
    entity_id: studioId,
    payload: { sessionId },
    result: "error",
    error: blad,
  });
}

/** Faktury na start ręcznie: mail do admina z danymi studia po każdej wpłacie. */
async function mailDoFaktury(admin: SupabaseClient, studioId: string, kwota: number, punkty: number, p24OrderId: number) {
  const [{ data: s }, { data: prof }] = await Promise.all([
    admin.from("studios").select("business_name, nip, address").eq("id", studioId).maybeSingle(),
    admin.from("profiles").select("email, full_name, phone").eq("id", studioId).maybeSingle(),
  ]);
  const kwotaTxt = kwota.toLocaleString("pl-PL", { minimumFractionDigits: 2 });
  const wiersz = (l: string, v: string | null | undefined) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#666;">${l}</td><td style="padding:4px 0;"><strong>${escapeHtml(v || "—")}</strong></td></tr>`;
  await sendEmail(
    ADMIN_EMAIL,
    `[Faktura] Wpłata ${kwotaTxt} zł — ${s?.business_name ?? "studio"}`,
    `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a;">
      <h2 style="font-size:18px;margin:0 0 12px;">Nowa wpłata za punkty — wystaw fakturę</h2>
      <table style="font-size:14px;border-collapse:collapse;">
        ${wiersz("Firma", s?.business_name)}
        ${wiersz("NIP", s?.nip)}
        ${wiersz("Adres", s?.address)}
        ${wiersz("E-mail", prof?.email)}
        ${wiersz("Osoba", prof?.full_name)}
        ${wiersz("Kwota brutto", `${kwotaTxt} zł`)}
        ${wiersz("Pakiet", punktyTxt(punkty))}
        ${wiersz("Nr transakcji P24", String(p24OrderId))}
      </table>
      <p style="font-size:13px;color:#666;margin-top:16px;">Punkty są już dopisane do salda studia. Brak NIP-u = poproś studio o dane do faktury.</p>
      <p><a href="${APP_URL}/admin/studia/${studioId}">Profil studia w panelu</a></p>
    </div>`,
    { log: { event: "platnosc_faktura", recipientRole: "admin" } }
  );
}
