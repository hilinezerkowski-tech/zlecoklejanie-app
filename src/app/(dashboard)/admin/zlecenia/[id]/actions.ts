"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAssignedEmail } from "@/lib/notify-assigned";
import { etykietaZlecenia, sendDesignerBrief } from "@/lib/designer-brief";
import { isValidEmail } from "@/lib/email";

type ActionResult = { ok: boolean; error?: string; message?: string };

/** Wspólny check: zalogowany użytkownik z rolą admin. Zwraca id admina albo błąd. */
async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Brak sesji." };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") return { ok: false, error: "Tylko admin." };
  return { ok: true, userId: user.id };
}

function revalidateOrder(orderId: string) {
  revalidatePath(`/admin/zlecenia/${orderId}`);
  revalidatePath("/admin/zlecenia");
}

/**
 * Admin oznacza wynik zlecenia: "completed" (doszło do skutku)
 * albo "cancelled" (nie doszło). Tylko dla roli admin.
 */
export async function setOrderOutcome(
  orderId: string,
  outcome: "completed" | "cancelled"
): Promise<ActionResult> {
  if (!["completed", "cancelled"].includes(outcome)) {
    return { ok: false, error: "Nieprawidłowy status." };
  }
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("orders")
    .update({ status: outcome })
    .eq("id", orderId)
    .not("status", "in", "(completed,cancelled)");

  if (error) return { ok: false, error: error.message };

  revalidateOrder(orderId);
  return { ok: true };
}

/**
 * Ponowna wysyłka maila "Nowe zlecenie do wyceny" do konkretnego przypisanego studia.
 * Przydatne, gdy studio zmieniło e-mail albo mail nie dotarł.
 * Adres pobierany świeżo z profiles; wpis w email_log jako "assigned_resend".
 */
export async function resendAssignedEmail(
  orderId: string,
  studioId: string
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const out = await sendAssignedEmail(admin, orderId, studioId, { resend: true });
  if (!out.ok) return { ok: false, error: out.error };

  revalidateOrder(orderId);
  if (out.result.status === "sent") {
    return { ok: true, message: `Wysłano ponownie na ${out.recipient}.` };
  }
  if (out.result.status === "skipped") {
    return { ok: false, error: "Wysyłka pominięta — brak klucza Resend na serwerze." };
  }
  return { ok: false, error: `Resend odrzucił wysyłkę: ${out.result.error ?? "nieznany błąd"}` };
}

/**
 * Usunięcie przypisania studia do zlecenia.
 *
 * - Studio "Wybrane" (klient wybrał jego ofertę) nie może być usunięte — najpierw cofnięcie wyniku.
 * - Jeśli studio ma już wycenę albo są wiadomości w rozmowie, bez `force` zwracamy
 *   ostrzeżenie (UI pyta "na pewno?"), z `force` kasujemy wyceny (FK bez kaskady)
 *   i przypisanie. Wiadomości zostają (historia jest niezmienna).
 * - Gdy zniknie ostatnie przypisanie, a zlecenie było "assigned", wraca do "new".
 */
export async function unassignStudio(
  orderId: string,
  studioId: string,
  force = false
): Promise<ActionResult & { needsConfirm?: boolean }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { data: assignment } = await admin
    .from("order_assignments")
    .select("id, status")
    .eq("order_id", orderId)
    .eq("studio_id", studioId)
    .maybeSingle();
  if (!assignment) return { ok: false, error: "To studio nie jest przypisane do zlecenia." };
  if (assignment.status === "chosen") {
    return {
      ok: false,
      error: "Klient wybrał to studio — najpierw cofnij wynik zlecenia, potem usuń przypisanie.",
    };
  }

  const [{ count: quotesCount }, { count: msgCount }] = await Promise.all([
    admin
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("studio_id", studioId),
    admin
      .from("order_messages")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("studio_id", studioId),
  ]);

  const hasHistory = (quotesCount ?? 0) > 0 || (msgCount ?? 0) > 0;
  if (hasHistory && !force) {
    const parts: string[] = [];
    if ((quotesCount ?? 0) > 0) parts.push(`${quotesCount} wycenę/y`);
    if ((msgCount ?? 0) > 0) parts.push(`${msgCount} wiadomości`);
    return {
      ok: false,
      needsConfirm: true,
      error: `To studio ma już ${parts.join(" i ")} przy tym zleceniu. Wyceny zostaną usunięte, wiadomości zostaną w historii. Usunąć mimo to?`,
    };
  }

  if ((quotesCount ?? 0) > 0) {
    const { error: qErr } = await admin
      .from("quotes")
      .delete()
      .eq("order_id", orderId)
      .eq("studio_id", studioId);
    if (qErr) return { ok: false, error: `Nie udało się usunąć wycen: ${qErr.message}` };
  }

  const { error: aErr } = await admin
    .from("order_assignments")
    .delete()
    .eq("id", assignment.id);
  if (aErr) return { ok: false, error: `Nie udało się usunąć przypisania: ${aErr.message}` };

  // Ostatnie przypisanie zniknęło → zlecenie wraca do puli "nowe"
  const { count: left } = await admin
    .from("order_assignments")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  if ((left ?? 0) === 0) {
    await admin
      .from("orders")
      .update({ status: "new", assigned_at: null })
      .eq("id", orderId)
      .eq("status", "assigned");
  }

  revalidateOrder(orderId);
  return { ok: true, message: "Przypisanie usunięte." };
}

// =====================================================================
// Dobór grafika (migracja 014)
// =====================================================================

const MAX_GRAFIKOW = 3;

/**
 * Sygnał „klient chce, żebyśmy dobrali grafika". Zwykle przychodzi
 * z formularza na landingu, ale admin musi móc ustawić go ręcznie —
 * klient równie często prosi o to przez telefon.
 */
export async function setNeedsDesigner(
  orderId: string,
  value: boolean
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("orders")
    .update({ needs_designer: value })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidateOrder(orderId);
  return { ok: true };
}

/**
 * Przypisuje grafika do zlecenia i wysyła mu brief.
 *
 * Kolejność ma znaczenie: najpierw zapis (ślad w bazie), potem mail.
 * Gdyby było odwrotnie, nieudany zapis zostawiłby grafika z briefem,
 * o którym panel nic nie wie. Nieudany mail NIE cofa przypisania —
 * admin widzi status wysyłki i może wysłać ponownie.
 */
export async function assignDesigner(
  orderId: string,
  designerId: string,
  brief: string
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const tresc = brief.trim();
  if (tresc.length < 20) {
    return { ok: false, error: "Brief jest za krótki — grafik musi wiedzieć, co ma zaprojektować." };
  }

  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("id, car_brand, car_model, city")
    .eq("id", orderId)
    .single();
  if (!order) return { ok: false, error: "Nie znaleziono zlecenia." };

  const { data: designer } = await admin
    .from("designers")
    .select("id, display_name, status")
    .eq("id", designerId)
    .maybeSingle();
  if (!designer) return { ok: false, error: "Nie znaleziono grafika." };
  if (designer.status !== "active") {
    return { ok: false, error: "Brief można wysłać tylko do aktywnego grafika." };
  }

  const { count } = await admin
    .from("order_designer_assignments")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  if ((count ?? 0) >= MAX_GRAFIKOW) {
    return { ok: false, error: `To zlecenie ma już ${MAX_GRAFIKOW} grafików.` };
  }

  const { data: row, error: insertErr } = await admin
    .from("order_designer_assignments")
    .insert({
      order_id: orderId,
      designer_id: designerId,
      brief: tresc,
      assigned_by: auth.userId,
    })
    .select("id")
    .single();

  if (insertErr || !row) {
    if (insertErr?.code === "23505") {
      return { ok: false, error: "Ten grafik już dostał brief do tego zlecenia." };
    }
    return { ok: false, error: `Błąd zapisu przypisania: ${insertErr?.message}` };
  }

  // Zlecenie z przypisanym grafikiem to zawsze zlecenie „z grafikiem"
  await admin.from("orders").update({ needs_designer: true }).eq("id", orderId);

  const out = await sendDesignerBrief(admin, {
    orderId,
    designerId,
    brief: tresc,
    orderLabel: etykietaZlecenia(order),
  });

  const emailStatus = out.ok ? out.result.status : "failed";
  const emailError = out.ok ? out.result.error ?? null : out.error;
  await admin
    .from("order_designer_assignments")
    .update({ email_status: emailStatus, email_error: emailError?.slice(0, 500) ?? null })
    .eq("id", row.id);

  revalidateOrder(orderId);

  if (emailStatus !== "sent") {
    return {
      ok: false,
      error:
        `Grafik przypisany, ale mail NIE poszedł (${emailError || emailStatus}). ` +
        "Brief jest widoczny w jego panelu — możesz wysłać ponownie.",
    };
  }
  return { ok: true, message: `Brief wysłany do „${designer.display_name}" na ${out.ok ? out.recipient : ""}.` };
}

/** Ponowna wysyłka briefu — treść bierzemy z zapisanego przypisania, nie z formularza. */
export async function resendDesignerBrief(
  orderId: string,
  designerId: string
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("order_designer_assignments")
    .select("id, brief")
    .eq("order_id", orderId)
    .eq("designer_id", designerId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Ten grafik nie jest przypisany do zlecenia." };

  const { data: order } = await admin
    .from("orders")
    .select("car_brand, car_model, city")
    .eq("id", orderId)
    .single();
  if (!order) return { ok: false, error: "Nie znaleziono zlecenia." };

  const out = await sendDesignerBrief(admin, {
    orderId,
    designerId,
    brief: row.brief,
    orderLabel: etykietaZlecenia(order),
    resend: true,
  });

  const emailStatus = out.ok ? out.result.status : "failed";
  const emailError = out.ok ? out.result.error ?? null : out.error;
  await admin
    .from("order_designer_assignments")
    .update({ email_status: emailStatus, email_error: emailError?.slice(0, 500) ?? null })
    .eq("id", row.id);

  revalidateOrder(orderId);
  if (emailStatus !== "sent") {
    return { ok: false, error: `Resend nie przyjął wysyłki: ${emailError || emailStatus}` };
  }
  return { ok: true, message: `Wysłano ponownie na ${out.ok ? out.recipient : ""}.` };
}

/** Usunięcie przypisania grafika. Ślad po odpowiedzi znika razem z wierszem. */
export async function unassignDesigner(
  orderId: string,
  designerId: string
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("order_designer_assignments")
    .delete()
    .eq("order_id", orderId)
    .eq("designer_id", designerId);
  if (error) return { ok: false, error: error.message };

  revalidateOrder(orderId);
  return { ok: true, message: "Przypisanie grafika usunięte." };
}

// =========================================================
// FAZA A3 — edycja danych zlecenia i kontaktu klienta (tylko admin)
// =========================================================

const ORDER_SERVICES = ["oklejanie", "ppf", "branding", "grafika", "inne"] as const;
const ORDER_SCOPES = ["full", "full_wneki", "partial", "front"] as const;

export type UpdateOrderInput = {
  service_type: string;
  scope: string | null;
  city: string;
  car_brand: string;
  car_model: string;
  car_year: string;
  description: string;
  estimated_min: string;
  estimated_max: string;
};

/** "" -> null, liczba całkowita >= 0 albo błąd. */
function parseIntField(
  v: string,
  label: string
): { ok: true; value: number | null } | { ok: false; error: string } {
  const t = (v ?? "").trim();
  if (!t) return { ok: true, value: null };
  if (!/^\d+$/.test(t)) return { ok: false, error: `${label}: podaj liczbę całkowitą.` };
  return { ok: true, value: parseInt(t, 10) };
}

/**
 * Edycja danych zlecenia przez admina: usługa, zakres, miasto/kod, pojazd,
 * opis, szacunek klienta. Nie rusza statusu, dat, klienta ani przypisań.
 * Studia i klient widzą zmianę od razu (czytają te same wiersze).
 */
export async function updateOrderDetails(
  orderId: string,
  input: UpdateOrderInput
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (!(ORDER_SERVICES as readonly string[]).includes(input.service_type)) {
    return { ok: false, error: "Nieznana usługa." };
  }
  const scope = input.scope ? input.scope : null;
  if (scope && !(ORDER_SCOPES as readonly string[]).includes(scope)) {
    return { ok: false, error: "Nieznany zakres." };
  }
  const city = (input.city ?? "").trim();
  if (!city) return { ok: false, error: "Miasto jest wymagane." };

  const year = parseIntField(input.car_year, "Rocznik");
  if (!year.ok) return year;
  const maxYear = new Date().getFullYear() + 1;
  if (year.value !== null && (year.value < 1950 || year.value > maxYear)) {
    return { ok: false, error: `Rocznik poza zakresem 1950–${maxYear}.` };
  }
  const min = parseIntField(input.estimated_min, "Szacunek od");
  if (!min.ok) return min;
  const max = parseIntField(input.estimated_max, "Szacunek do");
  if (!max.ok) return max;
  if (min.value !== null && max.value !== null && max.value < min.value) {
    return { ok: false, error: "Szacunek „do” nie może być mniejszy niż „od”." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("orders")
    .update({
      service_type: input.service_type,
      scope,
      city,
      car_brand: input.car_brand.trim() || null,
      car_model: input.car_model.trim() || null,
      car_year: year.value,
      description: input.description.trim() || null,
      estimated_min: min.value,
      estimated_max: max.value,
    })
    .eq("id", orderId);
  if (error) return { ok: false, error: `Błąd zapisu: ${error.message}` };

  revalidateOrder(orderId);
  return { ok: true, message: "Zapisano zmiany w zleceniu." };
}

export type UpdateOrderClientInput = {
  email: string;
  full_name: string;
  phone: string;
};

/**
 * Edycja kontaktu klienta zlecenia (profil klienta: e-mail, imię, telefon).
 *
 * - Działa na KONCIE klienta — zmiana dotyczy wszystkich jego zleceń.
 * - E-mail zmieniany najpierw w Supabase Auth (na ten adres klient loguje się
 *   magic-linkiem), potem w profiles — jak w updateStudio.
 * - Bezpiecznik: tylko profile z rolą "client". Zlecenie testowe założone
 *   np. na konto admina/studia nie może zmienić jego adresu logowania.
 */
export async function updateOrderClient(
  orderId: string,
  input: UpdateOrderClientInput
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const email = (input.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) return { ok: false, error: "Niepoprawny adres e-mail." };

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("client_id")
    .eq("id", orderId)
    .single();
  if (!order?.client_id) return { ok: false, error: "Zlecenie nie ma przypisanego klienta." };

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, email")
    .eq("id", order.client_id)
    .maybeSingle();
  if (!profile) return { ok: false, error: "Nie znaleziono profilu klienta." };
  if (profile.role !== "client") {
    return {
      ok: false,
      error: `To zlecenie jest na koncie z rolą „${profile.role}”, nie klienta — edycja zablokowana, żeby nie zmienić komuś logowania.`,
    };
  }

  if (email !== (profile.email || "").toLowerCase()) {
    const { data: taken } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .neq("id", profile.id)
      .maybeSingle();
    if (taken) return { ok: false, error: "Ten e-mail jest już przypisany do innego konta." };

    const { error: authErr } = await admin.auth.admin.updateUserById(profile.id, {
      email,
      email_confirm: true,
    });
    if (authErr) {
      return { ok: false, error: `Nie udało się zmienić e-maila logowania: ${authErr.message}` };
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({
      email,
      full_name: input.full_name.trim() || null,
      phone: input.phone.trim() || null,
    })
    .eq("id", profile.id);
  if (error) return { ok: false, error: `Błąd zapisu kontaktu: ${error.message}` };

  revalidateOrder(orderId);
  return { ok: true, message: "Zapisano dane klienta." };
}

// =========================================================
// FAZA A4 — ręczna zmiana statusu i cofnięcie wyniku (tylko admin)
// =========================================================

const ORDER_STATUSES = [
  "new",
  "assigned",
  "quoted",
  "chosen",
  "completed",
  "cancelled",
] as const;

/**
 * Ręczne ustawienie statusu zlecenia przez admina — pełna kontrola, także
 * cofnięcie z "completed"/"cancelled" z powrotem do stanu roboczego.
 * Nie dotyka toru grafika (designer_quotes) ani chosen_quote_id.
 */
export async function setOrderStatus(
  orderId: string,
  status: string
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Nieznany status." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("orders").update({ status }).eq("id", orderId);
  if (error) return { ok: false, error: `Błąd zapisu: ${error.message}` };

  revalidateOrder(orderId);
  return { ok: true, message: "Zmieniono status." };
}

/**
 * Cofnięcie wyniku "Doszło/Nie doszło" — przywraca zlecenie do stanu roboczego.
 * Docelowy status liczony ze stanu faktycznego zlecenia:
 *   wybrana wycena → "chosen"; jakakolwiek wycena → "quoted";
 *   jakiekolwiek przypisanie → "assigned"; inaczej → "new".
 */
export async function undoOrderOutcome(orderId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (!order) return { ok: false, error: "Nie znaleziono zlecenia." };
  if (!["completed", "cancelled"].includes(order.status)) {
    return { ok: false, error: "To zlecenie nie ma jeszcze oznaczonego wyniku." };
  }

  const [{ data: chosen }, { count: quoteCount }, { count: assignCount }] = await Promise.all([
    admin
      .from("quotes")
      .select("id")
      .eq("order_id", orderId)
      .eq("status", "chosen")
      .maybeSingle(),
    admin.from("quotes").select("id", { count: "exact", head: true }).eq("order_id", orderId),
    admin
      .from("order_assignments")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId),
  ]);

  const target = chosen
    ? "chosen"
    : (quoteCount ?? 0) > 0
      ? "quoted"
      : (assignCount ?? 0) > 0
        ? "assigned"
        : "new";

  const { error } = await admin.from("orders").update({ status: target }).eq("id", orderId);
  if (error) return { ok: false, error: `Błąd zapisu: ${error.message}` };

  revalidateOrder(orderId);
  return { ok: true, message: "Cofnięto wynik." };
}

// ─── A5: Ręczne tworzenie zlecenia przez admina ───────────────────────────────

export type CreateOrderInput = {
  email: string;
  full_name: string;
  phone: string;
  service_type: string;
  scope: string;
  city: string;
  car_brand: string;
  car_model: string;
  car_year: string;
  description: string;
  estimated_min: string;
  estimated_max: string;
};

export async function createOrderAsAdmin(
  input: CreateOrderInput
): Promise<ActionResult & { orderId?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { ok: false, error: "Podaj prawidłowy e-mail klienta." };
  if (!input.city.trim()) return { ok: false, error: "Miasto jest wymagane." };
  if (!input.service_type) return { ok: false, error: "Rodzaj usługi jest wymagany." };

  // Znajdź lub utwórz profil klienta
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let clientId: string;

  if (existing) {
    clientId = existing.id;
  } else {
    const { data: newUser, error: authErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: input.full_name || null,
        phone: input.phone || null,
      },
    });
    if (authErr || !newUser.user) {
      return { ok: false, error: `Nie udało się utworzyć konta: ${authErr?.message}` };
    }
    await admin.from("profiles").upsert(
      {
        id: newUser.user.id,
        email,
        full_name: input.full_name || null,
        phone: input.phone || null,
        role: "client",
      },
      { onConflict: "id" }
    );
    clientId = newUser.user.id;
  }

  const carYear = parseInt(input.car_year, 10);
  const estimMin = parseInt(input.estimated_min, 10);
  const estimMax = parseInt(input.estimated_max, 10);

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      client_id: clientId,
      service_type: input.service_type,
      scope: input.scope || "full",
      city: input.city.trim(),
      car_brand: input.car_brand || null,
      car_model: input.car_model || null,
      car_year: isNaN(carYear) ? null : carYear,
      description: input.description || null,
      estimated_min: isNaN(estimMin) ? null : estimMin,
      estimated_max: isNaN(estimMax) ? null : estimMax,
      status: "new",
      photos: [],
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    return { ok: false, error: `Błąd zapisu: ${orderErr?.message}` };
  }

  revalidatePath("/admin/zlecenia");
  return { ok: true, orderId: order.id };
}
