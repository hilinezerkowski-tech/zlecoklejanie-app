// Przypisanie studia do zlecenia — JEDNO miejsce dla panelu admina (server action
// assignStudio) i agenta AI (akcja assign_studio). Nigdy insert do order_assignments
// z przeglądarki (zasada z CLAUDE.md).
//
// Dobór po usłudze: studio spoza „pasujących” (brak usług / nie robi tej usługi)
// da się przypisać tylko z force=true, a każde takie wymuszenie trafia do admin_actions
// (action 'assign_mismatch'). Moduł bez "use server" — nie jest Server Action.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAssignedEmail } from "@/lib/notify-assigned";
import { labelUslugi, studioPasuje, type Dopasowanie } from "@/lib/uslugi";
import { dodajGodzinyRobocze, pobierzUstawieniaSla } from "@/lib/sla";

/** Aktywne przypisania (pending/quoted/chosen) na zlecenie. */
export const MAX_STUDIOS_PER_ORDER = 3;
/** Wszystkie przypisania z historią odmów i wygaśnięć (trigger check_max_assignments, migracja 028b). */
export const MAX_PRZYPISAN_LACZNIE = 5;

const NIEAKTYWNE = ["rejected", "declined", "expired"];

export type PrzypisanieWynik =
  | {
      ok: true;
      message: string;
      /** Studia przypisane mimo braku dopasowania (force). */
      wymuszone: { studioId: string; nazwa: string; dopasowanie: Dopasowanie }[];
      maileWyslane: number;
    }
  | {
      ok: false;
      error: string;
      /** true = da się powtórzyć z force=true po potwierdzeniu przez admina. */
      wymagaPotwierdzenia?: boolean;
      niepasujace?: { studioId: string; nazwa: string; dopasowanie: Dopasowanie }[];
    };

type StudioRow = {
  id: string;
  business_name: string | null;
  status: string;
  deleted_at: string | null;
  is_paused: boolean | null;
  services: string[] | null;
};

export async function przypiszStudia(
  admin: SupabaseClient,
  opts: { orderId: string; studioIds: string[]; adminId: string | null; force?: boolean }
): Promise<PrzypisanieWynik> {
  const { orderId, adminId } = opts;
  const studioIds = Array.from(new Set(opts.studioIds));
  if (studioIds.length === 0) return { ok: false, error: "Brak studiów do przypisania." };

  const { data: order } = await admin.from("orders").select("id, status, service_type").eq("id", orderId).maybeSingle();
  if (!order) return { ok: false, error: "Nie znaleziono zlecenia." };

  const { data: existing } = await admin.from("order_assignments").select("studio_id, status").eq("order_id", orderId);
  const wszystkie = (existing ?? []) as { studio_id: string; status: string }[];
  const juz = wszystkie.map((a) => a.studio_id);
  if (studioIds.some((id) => juz.includes(id))) {
    return { ok: false, error: "To studio było już przypisane do zlecenia (także po odmowie albo wygaśnięciu)." };
  }
  const aktywne = wszystkie.filter((a) => !NIEAKTYWNE.includes(a.status)).length;
  if (aktywne + studioIds.length > MAX_STUDIOS_PER_ORDER) {
    return { ok: false, error: `To zlecenie ma już ${aktywne} aktywne studia (max ${MAX_STUDIOS_PER_ORDER}).` };
  }
  if (wszystkie.length + studioIds.length > MAX_PRZYPISAN_LACZNIE) {
    return {
      ok: false,
      error: `To zlecenie wykorzystało limit ${MAX_PRZYPISAN_LACZNIE} przypisań (z historią odmów) — dobierz wykonawcę ręcznie.`,
    };
  }

  const { data: studios } = await admin
    .from("studios")
    .select("id, business_name, status, deleted_at, is_paused, services")
    .in("id", studioIds);
  const rows = (studios ?? []) as StudioRow[];
  const gotowe = studioIds.every((id) => {
    const s = rows.find((r) => r.id === id);
    return s && s.status === "active" && !s.deleted_at && !s.is_paused;
  });
  if (!gotowe) {
    return { ok: false, error: "Któreś ze studiów nie jest już aktywne albo ma pauzę leadów — odśwież stronę." };
  }

  // Dobór po usłudze: 'pasuje' i 'bez_filtra' (grafika/inne) przechodzą bez pytań.
  const niepasujace = rows
    .map((s) => ({
      studioId: s.id,
      nazwa: s.business_name || "studio",
      dopasowanie: studioPasuje(s.services, order.service_type),
    }))
    .filter((s) => s.dopasowanie === "brak_uslug" || s.dopasowanie === "nie_robi");
  if (niepasujace.length > 0 && !opts.force) {
    const uslugaTxt = labelUslugi(order.service_type);
    return {
      ok: false,
      wymagaPotwierdzenia: true,
      niepasujace,
      error: `${niepasujace
        .map((s) => `${s.nazwa} ${s.dopasowanie === "brak_uslug" ? "nie ma zaznaczonych usług" : "nie robi tej usługi"}`)
        .join("; ")} (potrzebna: ${uslugaTxt}).`,
    };
  }

  // Termin odpowiedzi (godziny robocze, src/lib/sla.ts). due_at NOT NULL = przypisanie pilnowane
  // przez cron; kolumna dochodzi z migracją 028b — bez niej zapisujemy przypisanie po staremu.
  const sla = await pobierzUstawieniaSla(admin);
  const dueAt = dodajGodzinyRobocze(new Date(), sla.wygasniecie, sla).toISOString();
  const wiersze = studioIds.map((studio_id) => ({ order_id: orderId, studio_id, assigned_by: adminId }));
  let { error: insertErr } = await admin.from("order_assignments").insert(wiersze.map((w) => ({ ...w, due_at: dueAt })));
  if (insertErr && /due_at/.test(insertErr.message)) {
    ({ error: insertErr } = await admin.from("order_assignments").insert(wiersze));
  }
  if (insertErr) {
    return {
      ok: false,
      error: insertErr.message.includes("Maksymalnie")
        ? "To zlecenie ma już komplet przypisań (limit w bazie)."
        : `Błąd przypisania: ${insertErr.message}`,
    };
  }

  await admin
    .from("orders")
    .update({ status: "assigned", assigned_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "new");

  // Dziennik wymuszeń — best effort, jak reszta logów admin_actions.
  for (const s of niepasujace) {
    const { error } = await admin.from("admin_actions").insert({
      admin_id: adminId,
      entity: "order",
      action: "assign_mismatch",
      entity_id: orderId,
      payload: { orderId, studioId: s.studioId, service: order.service_type, dopasowanie: s.dopasowanie },
      result: "ok",
      error: null,
    });
    if (error) console.warn("[assign] admin_actions insert failed:", error.message);
  }

  // Mail „Nowe zlecenie do wyceny” — jeden helper dla panelu i agenta.
  let wyslane = 0;
  for (const studioId of studioIds) {
    const out = await sendAssignedEmail(admin, orderId, studioId);
    if (out.ok && out.result.status === "sent") wyslane++;
  }

  const nazwy = studioIds.map((id) => rows.find((r) => r.id === id)?.business_name || "studio").join(", ");
  return {
    ok: true,
    wymuszone: niepasujace,
    maileWyslane: wyslane,
    message:
      `Przypisano: ${nazwy}. Maile o zleceniu: ${wyslane}/${studioIds.length} wysłane` +
      (wyslane < studioIds.length ? " — resztę wyślesz ponownie z panelu zlecenia." : "."),
  };
}
