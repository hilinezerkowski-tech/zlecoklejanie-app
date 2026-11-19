// Zamiana leada „zlecenie” z landingu na zlecenie w `orders` — JEDNO miejsce dla przycisku
// w /admin/leady (convertLeadToOrder) i automatu w /api/lead-alert (Etap 7, Faza 1).
// Bez "use server" i bez sprawdzania uprawnień — to robi wołający.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizujKod } from "@/lib/kod-pocztowy";
import { mapLandingUsluga } from "@/lib/uslugi";

export type WynikZamiany = { ok: true; orderId: string } | { ok: false; error: string };

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

/**
 * Zakłada (lub odnajduje) konto klienta i tworzy rekord `orders`.
 * Lead zostaje oznaczony jako obsłużony i podpięty pod utworzone zlecenie.
 */
export async function utworzZlecenieZLeada(admin: SupabaseClient, leadId: string): Promise<WynikZamiany> {
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
  // Kod pocztowy z formularza (opcjonalny) idzie przed nazwę: "05-090 Raszyn".
  // Dzięki temu dystans do studiów liczy się jednoznacznie, bez nowej kolumny.
  const kod = normalizujKod(p.kod_pocztowy);
  const city = [kod, (p.miasto || "").trim()].filter(Boolean).join(" ");
  if (!email) return { ok: false, error: "Lead nie zawiera adresu e-mail." };
  if (!city) return { ok: false, error: "Lead nie zawiera miasta (pole wymagane w zleceniu)." };

  // 1. Konto klienta — istniejące albo nowe (logowanie magic-linkiem, bez hasła).
  let clientId: string | undefined;

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile?.id) {
    // Konto o tym mailu juz istnieje. Jesli nalezy do studia lub admina, NIE
    // tworzymy zlecenia — middleware blokuje im /klient, wiec zlecenie byloby
    // niedostepne dla wlasciciela. Lepiej powiedziec to wprost.
    if (existingProfile.role && existingProfile.role !== "client") {
      return {
        ok: false,
        error: `Konto ${email} ma juz role „${existingProfile.role}". Zlecenie dla tego adresu trzeba zalozyc recznie albo poprosic klienta o inny e-mail.`,
      };
    }
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
      service_type: mapLandingUsluga(p.usluga),
      car_brand: car.brand,
      car_model: car.model,
      car_year: car.year,
      city,
      // Sygnal z formularza: klient chce, zebysmy dobrali grafika (migracja 014).
      // Trzymamy go w kolumnie, nie tylko w opisie — panel po tym filtruje.
      needs_designer: Boolean(p.potrzebuje_grafika),
      photos: Array.isArray((p as Record<string, unknown>).photos)
        ? ((p as Record<string, unknown>).photos as string[])
        : [],
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

  return { ok: true, orderId: order.id };
}
