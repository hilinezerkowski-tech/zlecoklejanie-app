"use server";

// Odpowiedź studia z linku tokenowego (bez logowania): wycena albo odmowa.
// Token weryfikowany przy KAŻDEJ akcji (HMAC + ważność); zmiany robi service_role, więc
// wszystkie warunki (status pending, własność przypisania) sprawdzamy tu, w kodzie.

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sprawdzToken } from "@/lib/action-links";
import { sendQuotedEmail } from "@/lib/notify-quoted";
import { czyKodOdmowy } from "@/lib/odmowa";

export type WynikOdpowiedzi = { ok: true; message: string } | { ok: false; error: string };

type Przypisanie = { id: string; order_id: string; studio_id: string; status: string };

async function przypisanieZTokenu(token: string): Promise<{ ok: true; a: Przypisanie } | { ok: false; error: string }> {
  const t = sprawdzToken(token);
  if (!t.ok) {
    return {
      ok: false,
      error: t.powod === "wygasl" ? "Ten link wygasł. Zaloguj się do panelu studia." : "Link jest nieprawidłowy.",
    };
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("order_assignments")
    .select("id, order_id, studio_id, status")
    .eq("id", t.assignmentId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Nie znaleziono zlecenia." };
  if (data.status !== "pending") {
    return { ok: false, error: "Na to zlecenie już odpowiedziano albo zostało przekazane dalej." };
  }
  return { ok: true, a: data as Przypisanie };
}

export async function wycenZTokenu(
  token: string,
  input: { priceMin: string; priceMax: string; days: string; comment: string }
): Promise<WynikOdpowiedzi> {
  const r = await przypisanieZTokenu(token);
  if (!r.ok) return r;
  const { a } = r;

  const min = parseInt(input.priceMin, 10);
  if (!input.priceMin || Number.isNaN(min) || min <= 0) return { ok: false, error: "Podaj poprawną cenę minimalną." };
  const max = input.priceMax ? parseInt(input.priceMax, 10) : null;
  if (max !== null && (Number.isNaN(max) || max < min)) {
    return { ok: false, error: "Cena maksymalna nie może być niższa od minimalnej." };
  }
  const dni = input.days ? parseInt(input.days, 10) : null;
  if (dni !== null && (Number.isNaN(dni) || dni < 0 || dni > 365)) return { ok: false, error: "Podaj poprawny czas realizacji." };
  const comment = input.comment.trim().slice(0, 2000) || null;

  const admin = createAdminClient();
  // Studio wyceniło już to zlecenie z panelu? (jedna wycena na studio)
  const { data: istniejaca } = await admin
    .from("quotes")
    .select("id")
    .eq("order_id", a.order_id)
    .eq("studio_id", a.studio_id)
    .maybeSingle();
  if (istniejaca) return { ok: false, error: "Wycena tego zlecenia została już wysłana." };

  const { error } = await admin.from("quotes").insert({
    order_id: a.order_id,
    studio_id: a.studio_id,
    assignment_id: a.id,
    price_min: min,
    price_max: max,
    estimated_days: dni,
    comment,
  });
  if (error) return { ok: false, error: "Nie udało się wysłać wyceny. Spróbuj ponownie." };

  // Statusy: zwykle robi je trigger bazy po wstawieniu wyceny; te update'y są idempotentne
  // i dopilnowują, żeby zlecenie nie zostało „pending” po naszej stronie.
  const teraz = new Date().toISOString();
  await admin
    .from("order_assignments")
    .update({ status: "quoted", responded_at: teraz })
    .eq("id", a.id)
    .eq("status", "pending");
  await admin.from("order_assignments").update({ responded_at: teraz }).eq("id", a.id).is("responded_at", null);
  await admin.from("orders").update({ status: "quoted" }).eq("id", a.order_id).in("status", ["new", "assigned"]);

  await sendQuotedEmail(admin, a.order_id).catch((e) => console.error("[o/wycena] mail klienta:", e));
  revalidatePath(`/admin/zlecenia/${a.order_id}`);
  return { ok: true, message: "Wycena wysłana. Klient dostał powiadomienie." };
}

export async function odrzucZTokenu(token: string, input: { kod: string; notatka: string }): Promise<WynikOdpowiedzi> {
  const r = await przypisanieZTokenu(token);
  if (!r.ok) return r;
  const { a } = r;
  if (!czyKodOdmowy(input.kod)) return { ok: false, error: "Wybierz powód odmowy." };
  const notatka = input.notatka.trim().slice(0, 300);
  if (input.kod === "inne" && !notatka) return { ok: false, error: "Napisz krótko, dlaczego nie bierzesz zlecenia." };

  const admin = createAdminClient();
  const powod = notatka && input.kod === "inne" ? `inne: ${notatka}` : input.kod;
  const { data: zmienione, error } = await admin
    .from("order_assignments")
    .update({ status: "declined", responded_at: new Date().toISOString(), decline_reason: powod })
    .eq("id", a.id)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: "Nie udało się zapisać odmowy. Spróbuj ponownie." };
  if (!zmienione?.length) return { ok: false, error: "Na to zlecenie już odpowiedziano." };

  const { error: logErr } = await admin.from("admin_actions").insert({
    admin_id: null,
    entity: "order",
    action: "assignment_declined",
    entity_id: a.order_id,
    payload: { assignmentId: a.id, studioId: a.studio_id, kod: input.kod, notatka: notatka || null },
    result: "ok",
    error: null,
  });
  if (logErr) console.warn("[o/odmowa] admin_actions insert failed:", logErr.message);

  revalidatePath(`/admin/zlecenia/${a.order_id}`);
  return { ok: true, message: "Dziękujemy za odpowiedź. Zlecenie przekażemy innemu studiu." };
}
