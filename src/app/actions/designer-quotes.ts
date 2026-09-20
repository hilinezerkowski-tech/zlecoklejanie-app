"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL, emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { etykietaZlecenia } from "@/lib/designer-brief";

export type QuoteResult = { ok: boolean; error?: string; message?: string };

export type DesignerQuoteInput = {
  price_min: number;
  price_max?: number | null;
  estimated_days?: number | null;
  comment?: string;
};

/**
 * Grafik wysyła (albo poprawia) wycenę projektu.
 *
 * Pierwsza wysyłka idzie sesją użytkownika — o tym, czy wolno, decyduje RLS
 * (migracja 015: tylko własny brief). Poprawka idzie kluczem service role,
 * bo `designer_quotes` celowo NIE ma polityki UPDATE — inaczej grafik mógłby
 * ustawić sobie status 'chosen'. Dlatego tutaj sami sprawdzamy właściciela
 * i zmieniamy wyłącznie pola wyceny.
 */
export async function sendDesignerQuote(
  assignmentId: string,
  input: DesignerQuoteInput
): Promise<QuoteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Brak sesji — zaloguj się ponownie." };

  const priceMin = Math.round(Number(input.price_min));
  const priceMax =
    input.price_max === null || input.price_max === undefined || `${input.price_max}` === ""
      ? null
      : Math.round(Number(input.price_max));
  const days =
    input.estimated_days === null ||
    input.estimated_days === undefined ||
    `${input.estimated_days}` === ""
      ? null
      : Math.round(Number(input.estimated_days));

  if (!Number.isFinite(priceMin) || priceMin < 0) {
    return { ok: false, error: "Podaj cenę (liczba w złotych)." };
  }
  if (priceMax !== null && (!Number.isFinite(priceMax) || priceMax < priceMin)) {
    return { ok: false, error: "Cena do nie może być niższa niż cena od." };
  }
  if (days !== null && (!Number.isFinite(days) || days <= 0)) {
    return { ok: false, error: "Czas realizacji podaj w dniach (liczba większa od zera)." };
  }

  const admin = createAdminClient();
  const { data: assignment } = await admin
    .from("order_designer_assignments")
    .select("id, order_id, designer_id, status")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!assignment || assignment.designer_id !== user.id) {
    return { ok: false, error: "Nie znaleziono briefu." };
  }
  if (assignment.status === "rejected") {
    return { ok: false, error: "Odrzuciłeś ten brief — nie można do niego wycenić." };
  }

  const { data: existing } = await admin
    .from("designer_quotes")
    .select("id, status")
    .eq("order_id", assignment.order_id)
    .eq("designer_id", user.id)
    .maybeSingle();

  if (existing && existing.status !== "sent") {
    return {
      ok: false,
      error:
        existing.status === "chosen"
          ? "Klient wybrał już tę wycenę — zmiany ustalcie bezpośrednio."
          : "Klient wybrał innego grafika, wyceny nie da się już zmienić.",
    };
  }

  const wartosci = {
    price_min: priceMin,
    price_max: priceMax,
    estimated_days: days,
    comment: input.comment?.trim() || null,
  };

  if (existing) {
    const { error } = await admin
      .from("designer_quotes")
      .update({ ...wartosci, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("designer_id", user.id)
      .eq("status", "sent");
    if (error) return { ok: false, error: `Nie udało się zapisać wyceny: ${error.message}` };
  } else {
    // Sesja użytkownika — wstawienie przechodzi tylko przez politykę RLS
    const { error } = await supabase.from("designer_quotes").insert({
      order_id: assignment.order_id,
      designer_id: user.id,
      assignment_id: assignment.id,
      ...wartosci,
    });
    if (error) {
      console.warn("[designer-quotes] insert failed:", error.message);
      return { ok: false, error: "Nie udało się wysłać wyceny. Odśwież stronę i spróbuj ponownie." };
    }
    // Wycena = zainteresowanie. Brief, który wisiał bez odpowiedzi, domykamy.
    if (assignment.status === "pending") {
      await admin
        .from("order_designer_assignments")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("id", assignment.id)
        .eq("status", "pending");
    }
  }

  try {
    await powiadomKlientaOWycenie(assignment.order_id, user.id, Boolean(existing));
  } catch (e) {
    console.warn("[designer-quotes] notify failed:", e);
  }

  revalidatePath("/grafik/briefy");
  revalidatePath(`/klient/zlecenia/${assignment.order_id}`);
  revalidatePath(`/admin/zlecenia/${assignment.order_id}`);
  return { ok: true, message: existing ? "Wycena zaktualizowana." : "Wycena wysłana klientowi." };
}

/** Mail do klienta: grafik przysłał wycenę. Best-effort. */
async function powiadomKlientaOWycenie(
  orderId: string,
  designerId: string,
  poprawka: boolean
) {
  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("id, car_brand, car_model, city, client_id")
    .eq("id", orderId)
    .single();
  if (!order) return;

  const { data: klient } = await admin
    .from("profiles")
    .select("email")
    .eq("id", order.client_id)
    .single();
  if (!klient?.email) return;

  const { data: designer } = await admin
    .from("designers")
    .select("display_name")
    .eq("id", designerId)
    .single();

  const label = etykietaZlecenia(order);
  await sendEmail(
    klient.email,
    poprawka ? `Zmieniona wycena grafika: ${label}` : `Nowa wycena grafika: ${label}`,
    emailLayout({
      title: poprawka ? "Grafik zmienił wycenę" : "Masz wycenę od grafika",
      body: `<p>Zlecenie: <strong>${escapeHtml(label)}</strong></p>
        <p><strong>${escapeHtml(designer?.display_name ?? "Grafik")}</strong> przysłał wycenę projektu graficznego. Porównaj propozycje i wybierz tę, która Ci pasuje — dopiero wtedy wymieniacie się kontaktem.</p>`,
      ctaUrl: `${APP_URL}/klient/zlecenia/${orderId}`,
      ctaLabel: "Zobacz wycenę",
      footer:
        "Wybór grafika jest niezależny od wyboru studia — możesz zdecydować w dowolnej kolejności.",
    }),
    {
      log: {
        event: poprawka ? "designer_quote_update" : "designer_quote",
        recipientRole: "client",
        orderId,
      },
    }
  );
}

/**
 * Maile po wyborze grafika. Sam wybór rozstrzyga RPC `choose_designer_quote`
 * (SECURITY DEFINER) — tutaj tylko powiadamiamy obie strony i sprawdzamy,
 * że wołający faktycznie jest klientem tego zlecenia.
 */
export async function notifyDesignerChosen(orderId: string): Promise<QuoteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Brak sesji." };

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, car_brand, car_model, city, client_id")
    .eq("id", orderId)
    .single();
  if (!order || order.client_id !== user.id) {
    return { ok: false, error: "Brak uprawnień do tego zlecenia." };
  }

  const { data: quote } = await admin
    .from("designer_quotes")
    .select("designer_id, price_min, price_max")
    .eq("order_id", orderId)
    .eq("status", "chosen")
    .maybeSingle();
  if (!quote) return { ok: false, error: "Żaden grafik nie jest wybrany." };

  const label = etykietaZlecenia(order);
  const [{ data: designerProfile }, { data: designer }, { data: klient }] = await Promise.all([
    admin.from("profiles").select("email").eq("id", quote.designer_id).single(),
    admin.from("designers").select("display_name").eq("id", quote.designer_id).single(),
    admin.from("profiles").select("email").eq("id", order.client_id).single(),
  ]);

  if (designerProfile?.email) {
    await sendEmail(
      designerProfile.email,
      `Klient wybrał Twoją wycenę: ${label}`,
      emailLayout({
        title: "Klient wybrał Twoją wycenę",
        body: `<p>Projekt: <strong>${escapeHtml(label)}</strong></p>
          <p>W panelu czeka kontakt do klienta. Odezwij się pierwszy — szybka reakcja zwykle decyduje o tym, czy projekt dojdzie do skutku.</p>`,
        ctaUrl: `${APP_URL}/grafik/briefy`,
        ctaLabel: "Zobacz kontakt do klienta",
      }),
      { log: { event: "designer_chosen", recipientRole: "designer", orderId } }
    );
  }

  if (klient?.email) {
    await sendEmail(
      klient.email,
      `Wybrałeś grafika: ${label}`,
      emailLayout({
        title: "Wybór grafika potwierdzony",
        body: `<p>Projekt: <strong>${escapeHtml(label)}</strong></p>
          <p>Wybrałeś <strong>${escapeHtml(designer?.display_name ?? "grafika")}</strong>. W panelu masz jego kontakt, a grafik dostał Twój.</p>`,
        ctaUrl: `${APP_URL}/klient/zlecenia/${orderId}`,
        ctaLabel: "Otwórz zlecenie",
      }),
      { log: { event: "designer_chosen_client", recipientRole: "client", orderId } }
    );
  }

  revalidatePath(`/klient/zlecenia/${orderId}`);
  revalidatePath("/grafik/briefy");
  revalidatePath(`/admin/zlecenia/${orderId}`);
  return { ok: true };
}
