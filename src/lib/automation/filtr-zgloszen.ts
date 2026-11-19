// Filtr duplikatów i spamu dla zgłoszeń klientów (Etap 7, Faza 3 — autonomia-przypisywania-brief.md).
//
// Działa ZAWSZE, niezależnie od przełączników automatyzacji: oznaczone zgłoszenie to wyjątek
// z definicji — dostaje kartę w agencie i nigdy nie przejdzie automatycznie dalej (Faza 1).
// Niczego nie odrzuca ani nie ukrywa: lead zostaje 'new' w /admin/leady, decyzja jest ręczna.
//
// Wymaga migracji 031 (kolumny landing_leads.auto_flag / auto_flag_details). Bez niej
// flagi się nie zapiszą — błąd trafia do admin_actions, alert do admina idzie normalnie.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidEmail } from "@/lib/email";
import { normalizujEmail, powodySpamu, tenSamTelefon } from "@/lib/automation/filtr-reguly";

const OKNO_DUPLIKATOW_MS = 24 * 60 * 60 * 1000;

export type FlagaZgloszenia = "duplikat" | "spam";

export type Powiazane = { typ: "lead" | "zlecenie"; id: string; createdAt: string; orderId?: string | null };

export type OcenaZgloszenia =
  | { flaga: null }
  | { flaga: FlagaZgloszenia; powody: string[]; powiazane: Powiazane[] };

type LeadDoOceny = { id: string; created_at: string; payload: Record<string, unknown> | null };

type InnyLead = { id: string; created_at: string; order_id: string | null; payload: Record<string, unknown> | null };
type ZlecenieRow = { id: string; created_at: string; client: { email: string | null; phone: string | null } | null };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Wcześniejsze zgłoszenia i zlecenia tego samego klienta (e-mail albo telefon) z 24 h. */
async function znajdzDuplikaty(admin: SupabaseClient, lead: LeadDoOceny): Promise<Powiazane[]> {
  const p = lead.payload || {};
  const email = normalizujEmail(str(p.email));
  const telefon = str(p.telefon);
  if (!email && !telefon) return [];

  const do_ = new Date(lead.created_at);
  const od = new Date(do_.getTime() - OKNO_DUPLIKATOW_MS).toISOString();

  const [leady, zlecenia] = await Promise.all([
    admin
      .from("landing_leads")
      .select("id, created_at, order_id, payload")
      .eq("kind", "zlecenie")
      .neq("id", lead.id)
      .gte("created_at", od)
      .lte("created_at", do_.toISOString()),
    // Zlecenia dodane ręcznie w panelu nie mają leada — szukamy ich po profilu klienta.
    admin
      .from("orders")
      .select("id, created_at, client:profiles!orders_client_id_fkey(email, phone)")
      .gte("created_at", od),
  ]);

  const tenSam = (e: string, t: string) =>
    (email && normalizujEmail(e) === email) || (telefon && tenSamTelefon(t, telefon));

  const wynik: Powiazane[] = [];
  for (const l of (leady.data ?? []) as InnyLead[]) {
    const q = l.payload || {};
    if (tenSam(str(q.email), str(q.telefon))) {
      wynik.push({ typ: "lead", id: l.id, createdAt: l.created_at, orderId: l.order_id });
    }
  }
  const zLeadow = new Set(wynik.map((w) => w.orderId).filter(Boolean));
  for (const o of (zlecenia.data ?? []) as unknown as ZlecenieRow[]) {
    if (zLeadow.has(o.id)) continue;
    if (tenSam(o.client?.email || "", o.client?.phone || "")) {
      wynik.push({ typ: "zlecenie", id: o.id, createdAt: o.created_at });
    }
  }
  return wynik;
}

export async function ocenZgloszenie(admin: SupabaseClient, lead: LeadDoOceny): Promise<OcenaZgloszenia> {
  const p = lead.payload || {};
  const spam = powodySpamu(p, isValidEmail(p.email));
  const powiazane = await znajdzDuplikaty(admin, lead);

  if (powiazane.length > 0) {
    // Duplikat ma pierwszeństwo — zwykle to prawdziwy klient, który wysłał formularz drugi raz.
    return {
      flaga: "duplikat",
      powody: [`ten sam e-mail lub telefon co ${powiazane.length} zgłoszeni${powiazane.length === 1 ? "e" : "a"} z ostatnich 24 h`, ...spam],
      powiazane,
    };
  }
  if (spam.length > 0) return { flaga: "spam", powody: spam, powiazane: [] };
  return { flaga: null };
}

/**
 * Ocena + zapis flagi na leadzie + ślad w admin_actions (entity 'automation').
 * Nigdy nie rzuca — filtr nie może zablokować alertu o nowym zgłoszeniu.
 */
export async function filtrujZgloszenie(admin: SupabaseClient, lead: LeadDoOceny): Promise<OcenaZgloszenia> {
  let ocena: OcenaZgloszenia;
  try {
    ocena = await ocenZgloszenie(admin, lead);
  } catch (e) {
    console.error("[filtr] ocena nieudana:", e);
    return { flaga: null };
  }
  if (!ocena.flaga) return ocena;

  // .is(auto_flag, null) — ponowne wywołanie dla tego samego leada nie dubluje wpisu w logu.
  const { data, error } = await admin
    .from("landing_leads")
    .update({ auto_flag: ocena.flaga, auto_flag_details: { powody: ocena.powody, powiazane: ocena.powiazane } })
    .eq("id", lead.id)
    .is("auto_flag", null)
    .select("id");
  if (!error && (data ?? []).length === 0) return ocena;

  const { error: logErr } = await admin.from("admin_actions").insert({
    admin_id: null,
    entity: "automation",
    action: `flag_${ocena.flaga}`,
    entity_id: lead.id,
    payload: { leadId: lead.id, powody: ocena.powody, powiazane: ocena.powiazane },
    result: error ? "error" : "ok",
    error: error ? error.message : null,
  });
  if (error) console.warn("[filtr] zapis flagi nieudany (migracja 031?):", error.message);
  if (logErr) console.warn("[filtr] admin_actions insert failed:", logErr.message);
  return ocena;
}

export const ETYKIETA_FLAGI: Record<FlagaZgloszenia, string> = {
  duplikat: "Możliwy duplikat",
  spam: "Podejrzenie spamu",
};
