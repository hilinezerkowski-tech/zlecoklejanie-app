// Automatyczne przypisanie studiów do nowego zlecenia (Etap 7, Faza 1 — autonomia-przypisywania-brief.md).
//
// Wołane z /api/lead-alert TYLKO gdy przełącznik „Automatyczne przypisywanie zleceń” jest WŁ.
// i filtr (Faza 3) nie oznaczył zgłoszenia. Przypisanie zawsze przez przypiszStudia() bez force —
// limity, termin odpowiedzi (SLA) i maile do studiów działają tak samo jak przy kliknięciu.
// Każda decyzja (przypisano / wyjątek) = wpis w admin_actions (entity 'automation', action 'auto_assign').
// Wyjątek = zlecenie zostaje 'new' i wraca do zwykłej karty „nowe zlecenie” w agencie.

import type { SupabaseClient } from "@supabase/supabase-js";
import { przypiszStudia, MAX_STUDIOS_PER_ORDER } from "@/lib/assign-studio";
import { labelUslugi, normalizujUslugeZlecenia, studioPasuje } from "@/lib/uslugi";
import { geokoduj, punktZKodu, sortujWgOdleglosci } from "@/lib/geo";
import { wybierzStudia, type Kandydat } from "@/lib/automation/auto-reguly";
import { pobierzPromienie } from "@/lib/automation/ustawienia";
import { utworzZlecenieZLeada } from "@/lib/automation/zlecenie-z-leada";
import { studiaBezPunktow } from "@/lib/punkty";

export type WynikAutomatu =
  | { przypisano: true; studia: { id: string; nazwa: string; km: number | null }[]; promienKm: number | null; message: string }
  | { przypisano: false; powod: string };

type StudioRow = { id: string; business_name: string | null; slug: string | null; address: string | null; services: string[] | null };

async function zapiszLog(
  admin: SupabaseClient,
  orderId: string,
  payload: Record<string, unknown>,
  powodWyjatku?: string
) {
  const { error } = await admin.from("admin_actions").insert({
    admin_id: null,
    entity: "automation",
    action: "auto_assign",
    entity_id: orderId,
    payload: { orderId, ...payload },
    result: powodWyjatku ? "error" : "ok",
    error: powodWyjatku ?? null,
  });
  if (error) console.warn("[automat] admin_actions insert failed:", error.message);
}

const OKNO_OBCIAZENIA_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Obciążenie studiów (Faza 2): przypisania z ostatnich 7 dni, które studio nadal ma „na głowie”
 * albo zrealizowało — bez odmów, wygaśnięć i odrzuceń przez klienta. Studio → liczba.
 */
async function obciazenieStudiow(admin: SupabaseClient): Promise<Map<string, number>> {
  const od = new Date(Date.now() - OKNO_OBCIAZENIA_MS).toISOString();
  const { data } = await admin
    .from("order_assignments")
    .select("studio_id")
    .gte("assigned_at", od)
    .not("status", "in", "(declined,expired,rejected)");
  const wynik = new Map<string, number>();
  for (const r of (data ?? []) as { studio_id: string }[]) {
    wynik.set(r.studio_id, (wynik.get(r.studio_id) ?? 0) + 1);
  }
  return wynik;
}

export type WynikZgloszenia =
  | { etap: "brak_zlecenia"; powod: string }
  | { etap: "zlecenie"; orderId: string; wynik: WynikAutomatu };

/**
 * Pełny automat dla świeżego zgłoszenia klienta: lead → zlecenie → przypisanie.
 * Wołający sprawdza przełącznik i filtr (Faza 3) — tu ich nie ma.
 */
export async function automatZgloszenia(
  admin: SupabaseClient,
  leadId: string,
  wykonawcaSlug: string | null
): Promise<WynikZgloszenia> {
  const z = await utworzZlecenieZLeada(admin, leadId);
  if (!z.ok) {
    const { error } = await admin.from("admin_actions").insert({
      admin_id: null,
      entity: "automation",
      action: "auto_lead_to_order",
      entity_id: leadId,
      payload: { leadId },
      result: "error",
      error: z.error,
    });
    if (error) console.warn("[automat] admin_actions insert failed:", error.message);
    return { etap: "brak_zlecenia", powod: z.error };
  }
  return {
    etap: "zlecenie",
    orderId: z.orderId,
    wynik: await autoPrzypiszZlecenie(admin, z.orderId, { leadId, wykonawcaSlug }),
  };
}

export async function autoPrzypiszZlecenie(
  admin: SupabaseClient,
  orderId: string,
  opts: { leadId?: string; wykonawcaSlug?: string | null } = {}
): Promise<WynikAutomatu> {
  const kontekst = { leadId: opts.leadId ?? null, wykonawcaSlug: opts.wykonawcaSlug ?? null };
  const wyjatek = async (powod: string): Promise<WynikAutomatu> => {
    await zapiszLog(admin, orderId, kontekst, powod);
    return { przypisano: false, powod };
  };

  try {
    const { data: order } = await admin
      .from("orders")
      .select("id, status, city, service_type")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return wyjatek("nie znaleziono zlecenia");
    if (order.status !== "new") return wyjatek(`zlecenie ma już status „${order.status}”`);

    // grafika / inne / brak usługi — nie da się dobrać studia po usłudze, decyzja ręczna.
    const usluga = normalizujUslugeZlecenia(order.service_type);
    if (!usluga || usluga === "grafika" || usluga === "inne") {
      return wyjatek(`usługa „${labelUslugi(order.service_type)}” bez jednoznacznego dopasowania`);
    }

    const { data: studios } = await admin
      .from("studios")
      .select("id, business_name, slug, address, services")
      .eq("status", "active")
      .eq("is_paused", false)
      .is("deleted_at", null);

    // Gate 1: przy płatnych wycenach automat pomija studia bez punktów (i tak by nie wyceniły).
    const wszystkie = (studios ?? []) as StudioRow[];
    const bezPunktow = await studiaBezPunktow(admin, wszystkie.map((s) => s.id));
    if (opts.wykonawcaSlug && wszystkie.some((s) => s.slug === opts.wykonawcaSlug && bezPunktow.has(s.id))) {
      return wyjatek("studio wskazane przez klienta nie ma punktów na wycenę");
    }

    const zKm = sortujWgOdleglosci(
      wszystkie.filter((s) => !bezPunktow.has(s.id)).map((s) => ({ ...s, business_name: s.business_name ?? undefined })),
      order.city
    );
    const obciazenie = await obciazenieStudiow(admin);
    const kandydaci: Kandydat[] = zKm.map((s) => ({
      id: s.id,
      nazwa: s.business_name || "studio",
      slug: s.slug,
      km: s.odleglosc_km,
      pasuje: studioPasuje(s.services, order.service_type) === "pasuje",
      obciazenie: obciazenie.get(s.id) ?? 0,
    }));
    const nazwaMiasta = (order.city || "").replace(/\d{2}-?\d{3}/, "").trim();
    const miastoRozpoznane = Boolean(punktZKodu(order.city) ?? (nazwaMiasta ? geokoduj(nazwaMiasta) : null));

    const decyzja = wybierzStudia(kandydaci, {
      promienie: await pobierzPromienie(admin),
      max: MAX_STUDIOS_PER_ORDER,
      wykonawcaSlug: opts.wykonawcaSlug,
      miastoRozpoznane,
      usluga: labelUslugi(order.service_type),
    });
    if (!decyzja.przypisz) return wyjatek(decyzja.powod);

    const res = await przypiszStudia(admin, {
      orderId,
      studioIds: decyzja.studia.map((s) => s.id),
      adminId: null,
      force: false,
    });
    if (!res.ok) return wyjatek(`przypisanie odrzucone: ${res.error}`);

    const studia = decyzja.studia.map((s) => ({ id: s.id, nazwa: s.nazwa, km: s.km }));
    await zapiszLog(admin, orderId, {
      ...kontekst,
      // Obciążenie w logu — żeby było widać, dlaczego ranking wybrał te studia (Faza 2).
      studia: decyzja.studia.map((s) => ({ id: s.id, nazwa: s.nazwa, km: s.km, obciazenie7d: s.obciazenie ?? 0 })),
      promienKm: decyzja.promienKm,
      regula: decyzja.powod,
      maileWyslane: res.maileWyslane,
    });
    return { przypisano: true, studia, promienKm: decyzja.promienKm, message: res.message };
  } catch (e) {
    console.error("[automat] auto-przypisanie threw:", e);
    return wyjatek(`błąd automatu: ${e instanceof Error ? e.message : String(e)}`);
  }
}
