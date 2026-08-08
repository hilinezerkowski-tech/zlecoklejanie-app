"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type LeadActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  orderId?: string;
};

/**
 * Mapowanie etykiet z formularza na landing page (select "usluga")
 * na enum `service_type` w bazie.
 */
function mapServiceType(usluga: string | undefined): string {
  const s = (usluga || "").toLowerCase();
  if (s.includes("ppf")) return "ppf";
  if (s.includes("projekt graficzny")) return "grafika";
  if (s.includes("reklamow") || s.includes("branding")) return "branding";
  if (s.includes("wrap") || s.includes("kolor") || s.includes("detale"))
    return "oklejanie";
  if (s.includes("inne")) return "inne";
  return "oklejanie";
}

/** "BMW X5 G05 2023" -> { brand: "BMW", model: "X5 G05 2023", year: 2023 } */
function parseCar(auto: string | undefined) {
  const raw = (auto || "").trim();
  if (!raw) return { brand: null as string | null, model: null as string | null, year: null as number | null };
  const parts = raw.split(/\s+/);
  const brand = parts[0];
  const model = parts.slice(1).join(" ") || null;
  const yearMatch = raw.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null;
  return { brand, model, year };
}

/** Wspólna kontrola uprawnień — tylko admin. */
async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
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

  if (me?.role !== "admin") return { ok: false, error: "Brak uprawnień (tylko admin)." };
  return { ok: true };
}

/**
 * Zamienia lead typu "zlecenie" na pełnoprawne zlecenie w bazie:
 * zakłada (lub odnajduje) konto klienta i tworzy rekord `orders`.
 * Lead zostaje oznaczony jako obsłużony i podpięty pod utworzone zlecenie.
 */
export async function convertLeadToOrder(leadId: string): Promise<LeadActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();

  const { data: lead, error: leadErr } = await admin
    .from("landing_leads")
    .select("id, kind, payload, status, order_id")
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) return { ok: false, error: "Nie znaleziono leada." };
  if (lead.order_id) return { ok: false, error: "Ten lead ma już utworzone zlecenie." };
  if (lead.kind !== "zlecenie")
    return { ok: false, error: "Tylko lead typu „zlecenie” można zamienić na zlecenie." };

  const p = (lead.payload || {}) as Record<string, string>;
  const email = (p.email || "").trim().toLowerCase();
  const city = (p.miasto || "").trim();
  if (!email) return { ok: false, error: "Lead nie zawiera adresu e-mail." };
  if (!city) return { ok: false, error: "Lead nie zawiera miasta (pole wymagane w zleceniu)." };

  // 1. Konto klienta — istniejące albo nowe (logowanie magic-linkiem, bez hasła).
  let clientId: string | undefined;

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile?.id) {
    clientId = existingProfile.id;
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { role: "client" },
    });
    if (createErr || !created.user?.id) {
      return { ok: false, error: `Nie udało się utworzyć konta klienta: ${createErr?.message ?? "brak ID"}` };
    }
    clientId = created.user.id;
  }

  // Uzupełnij telefon, jeśli klient go podał, a profil go nie ma.
  if (p.telefon) {
    await admin.from("profiles").update({ phone: p.telefon.trim() }).eq("id", clientId).is("phone", null);
  }

  // 2. Zlecenie. Opis sklejamy z pól, które nie mają odpowiednika w kolumnach,
  //    żeby nic z formularza nie zginęło.
  const car = parseCar(p.auto);
  const descParts: string[] = [];
  if (p.usluga) descParts.push(`Usługa (z formularza): ${p.usluga}`);
  if (p.szczegoly) descParts.push(p.szczegoly);
  if (p.potrzebuje_grafika) descParts.push("Klient prosi o dobranie grafika.");
  if (p.telefon) descParts.push(`Telefon: ${p.telefon}`);

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      client_id: clientId,
      service_type: mapServiceType(p.usluga),
      car_brand: car.brand,
      car_model: car.model,
      car_year: car.year,
      city,
      description: descParts.join("\n\n") || null,
      status: "new",
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    return { ok: false, error: `Błąd tworzenia zlecenia: ${orderErr?.message}` };
  }

  // 3. Domknij leada.
  await admin
    .from("landing_leads")
    .update({ status: "handled", handled_at: new Date().toISOString(), order_id: order.id })
    .eq("id", leadId);

  revalidatePath("/admin/leady");
  revalidatePath("/admin/zlecenia");
  revalidatePath("/admin");

  return { ok: true, message: "Zlecenie utworzone. Możesz przypisać studia.", orderId: order.id };
}

/** Ręczna zmiana statusu leada: 'new' | 'handled' | 'spam'. */
export async function setLeadStatus(
  leadId: string,
  status: "new" | "handled" | "spam"
): Promise<LeadActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("landing_leads")
    .update({
      status,
      handled_at: status === "new" ? null : new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/leady");
  revalidatePath("/admin");
  return { ok: true, message: "Status leada zaktualizowany." };
}
