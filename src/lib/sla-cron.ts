// Zadanie cykliczne (co 15 min): pilnowanie terminu odpowiedzi studia.
//  - T+4 h roboczych bez odpowiedzi → przypomnienie (mail + SMS),
//  - T+24 h roboczych → ostatnie przypomnienie,
//  - T+48 h roboczych → status 'expired', mail „przekazaliśmy dalej”; karta „Podmień studio”
//    w agencie (feed liczy ją ze stanu bazy) albo — gdy admin włączył „Automatyczną podmianę” —
//    od razu przypisanie następnego kandydata przez przypiszStudia (bez force).
//  - wznowienie studiów z pauzą do daty (paused_until).
// Czasy: src/lib/sla.ts / ustawienia admina. Poza godzinami roboczymi nic nie wysyłamy.
// Tylko przypisania z due_at (nowe po migracji 028b) — stare nie dostają przypomnień.

import type { SupabaseClient } from "@supabase/supabase-js";
import { godzinyRobocze, godzinyRoboczeMiedzy, pobierzUstawieniaSla } from "@/lib/sla";
import { wyslijPrzypomnienie, wyslijWygasniecie } from "@/lib/notify-sla";
import { znajdzKandydatow } from "@/lib/podmiana";
import { przypiszStudia } from "@/lib/assign-studio";

export type WynikSla = {
  wznowionePauzy: number;
  poza_godzinami: boolean;
  sprawdzone: number;
  przypomnienia1: number;
  przypomnienia2: number;
  wygasniete: number;
  autoPodmiany: number;
  bledy: string[];
};

type Wiersz = {
  id: string;
  order_id: string;
  studio_id: string;
  assigned_at: string;
  reminders_sent: number;
  order: { id: string; status: string; city: string; service_type: string } | null;
};

export async function czyAutoPodmiana(admin: SupabaseClient): Promise<boolean> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "auto_podmiana").maybeSingle();
  return Boolean((data?.value as { wlaczona?: boolean } | null)?.wlaczona);
}

async function zapiszAkcje(
  admin: SupabaseClient,
  action: string,
  orderId: string,
  payload: Record<string, unknown>,
  error?: string
) {
  const { error: e } = await admin.from("admin_actions").insert({
    admin_id: null,
    entity: "order",
    action,
    entity_id: orderId,
    payload,
    result: error ? "error" : "ok",
    error: error ?? null,
  });
  if (e) console.warn("[sla] admin_actions insert failed:", e.message);
}

export async function przetworzTerminy(admin: SupabaseClient): Promise<WynikSla> {
  const wynik: WynikSla = {
    wznowionePauzy: 0,
    poza_godzinami: false,
    sprawdzone: 0,
    przypomnienia1: 0,
    przypomnienia2: 0,
    wygasniete: 0,
    autoPodmiany: 0,
    bledy: [],
  };
  const teraz = new Date();

  // 1. Wznowienie po pauzie do daty (niezależnie od godzin roboczych).
  const { data: wznowione, error: pauzaErr } = await admin
    .from("studios")
    .update({ is_paused: false, paused_until: null })
    .eq("is_paused", true)
    .not("paused_until", "is", null)
    .lte("paused_until", teraz.toISOString())
    .select("id");
  if (pauzaErr) wynik.bledy.push(`pauza: ${pauzaErr.message}`);
  wynik.wznowionePauzy = wznowione?.length ?? 0;

  const sla = await pobierzUstawieniaSla(admin);
  if (!godzinyRobocze(teraz, sla)) {
    wynik.poza_godzinami = true;
    return wynik;
  }

  // 2. Przypisania czekające na odpowiedź.
  const { data, error } = await admin
    .from("order_assignments")
    .select("id, order_id, studio_id, assigned_at, reminders_sent, order:orders!inner(id, status, city, service_type)")
    .eq("status", "pending")
    .not("due_at", "is", null);
  if (error) {
    wynik.bledy.push(`przypisania: ${error.message}`);
    return wynik;
  }
  const wiersze = (data ?? []) as unknown as Wiersz[];
  const autoPodmiana = wiersze.length > 0 ? await czyAutoPodmiana(admin) : false;

  for (const w of wiersze) {
    try {
      if (!w.order || ["chosen", "completed", "cancelled"].includes(w.order.status)) continue;
      wynik.sprawdzone++;
      const h = godzinyRoboczeMiedzy(new Date(w.assigned_at), teraz, sla);
      const ctx = { admin, assignmentId: w.id, orderId: w.order_id, studioId: w.studio_id };

      if (h >= sla.wygasniecie) {
        // Warunek status='pending' chroni przed wyścigiem z równoległą odpowiedzią studia.
        const { data: zmienione } = await admin
          .from("order_assignments")
          .update({ status: "expired" })
          .eq("id", w.id)
          .eq("status", "pending")
          .select("id");
        if (!zmienione?.length) continue;
        wynik.wygasniete++;
        const mail = await wyslijWygasniecie(ctx);
        await zapiszAkcje(admin, "assignment_expired", w.order_id, { assignmentId: w.id, studioId: w.studio_id, mail });

        if (autoPodmiana) {
          const kandydaci = await znajdzKandydatow(admin, w.order);
          if (kandydaci.length > 0) {
            const r = await przypiszStudia(admin, { orderId: w.order_id, studioIds: [kandydaci[0].id], adminId: null });
            if (r.ok) wynik.autoPodmiany++;
            await zapiszAkcje(
              admin,
              "auto_replace",
              w.order_id,
              { zamiast: w.studio_id, studioId: kandydaci[0].id },
              r.ok ? undefined : r.error
            );
          } else {
            await zapiszAkcje(admin, "auto_replace", w.order_id, { zamiast: w.studio_id }, "Brak pasującego kandydata");
          }
        }
      } else if (h >= sla.przypomnienie2 && w.reminders_sent < 2) {
        const { data: ok } = await admin
          .from("order_assignments")
          .update({ reminders_sent: 2 })
          .eq("id", w.id)
          .eq("reminders_sent", w.reminders_sent)
          .select("id");
        if (!ok?.length) continue;
        const r = await wyslijPrzypomnienie(ctx, 2);
        wynik.przypomnienia2++;
        await zapiszAkcje(admin, "reminder_2", w.order_id, { assignmentId: w.id, ...r });
      } else if (h >= sla.przypomnienie1 && w.reminders_sent < 1) {
        const { data: ok } = await admin
          .from("order_assignments")
          .update({ reminders_sent: 1 })
          .eq("id", w.id)
          .eq("reminders_sent", 0)
          .select("id");
        if (!ok?.length) continue;
        const r = await wyslijPrzypomnienie(ctx, 1);
        wynik.przypomnienia1++;
        await zapiszAkcje(admin, "reminder_1", w.order_id, { assignmentId: w.id, ...r });
      }
    } catch (e) {
      wynik.bledy.push(`${w.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
    }
  }
  return wynik;
}
