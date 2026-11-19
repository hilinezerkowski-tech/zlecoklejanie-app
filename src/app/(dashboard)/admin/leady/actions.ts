"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { createStudio } from "../studia/actions";
import { createDesigner } from "../graficy/actions";
import { adresZKodem } from "@/lib/kod-pocztowy";
import { mapLandingCheckboxy } from "@/lib/uslugi";
import { utworzZlecenieZLeada } from "@/lib/automation/zlecenie-z-leada";

export type LeadActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  orderId?: string;
};

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

  // Ta sama ścieżka co automat w /api/lead-alert (Etap 7) — logika w jednym miejscu.
  const res = await utworzZlecenieZLeada(createAdminClient(), leadId);
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/admin/leady");
  revalidatePath("/admin/zlecenia");
  revalidatePath("/admin");

  return { ok: true, message: "Zlecenie utworzone. Możesz przypisać studia.", orderId: res.orderId };
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

/**
 * Zamienia lead typu "studio" na aktywne konto studia.
 * Deleguje do `createStudio` — tej samej logiki, ktorej uzywa formularz
 * w /admin/studia — zeby nie duplikowac obslugi service role i kolizji e-maili.
 */
export async function convertLeadToStudio(leadId: string): Promise<LeadActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("landing_leads")
    .select("id, kind, payload, status")
    .eq("id", leadId)
    .single();

  if (!lead) return { ok: false, error: "Nie znaleziono leada." };
  if (lead.kind !== "studio")
    return { ok: false, error: "Tylko lead typu „studio” mozna zamienic na studio." };

  const p = (lead.payload || {}) as Record<string, string>;
  const email = (p.email || "").trim().toLowerCase();
  const businessName = (p.nazwa || "").trim();
  if (!email || !businessName)
    return { ok: false, error: "Lead nie zawiera e-maila lub nazwy firmy." };

  // Usługi z checkboxów formularza (stare usl_wrap… i nowe usl_<kod>). Bez usługi
  // createStudio zwróci błąd — wtedy dodaj wykonawcę ręcznie w /admin/studia.
  const uslugi = mapLandingCheckboxy(p);
  const res = await createStudio({
    email,
    business_name: businessName,
    address: adresZKodem(p.miasto, p.kod_pocztowy) || undefined,
    instagram: p.instagram || undefined,
    phone: p.telefon || undefined,
    services: uslugi.services,
    u_klienta: uslugi.uKlienta,
  });

  if (!res.ok) {
    return {
      ok: false,
      error: uslugi.services.length
        ? res.error
        : `${res.error} Zgłoszenie nie ma zaznaczonych usług — dodaj wykonawcę ręcznie w /admin/studia.`,
    };
  }

  await admin
    .from("landing_leads")
    .update({ status: "handled", handled_at: new Date().toISOString() })
    .eq("id", leadId);

  revalidatePath("/admin/leady");
  revalidatePath("/admin/studia");
  revalidatePath("/admin");

  return { ok: true, message: res.message };
}

/**
 * Zamienia lead typu "grafik" na aktywne konto grafika.
 * Symetryczne do `convertLeadToStudio` — deleguje do `createDesigner`,
 * zeby nie duplikowac obslugi service role, kolizji e-maili i maila powitalnego.
 *
 * Uwaga: `createDesigner` wymaga portfolio. Formularz na landingu je zbiera,
 * ale gdyby leada wpisano recznie bez linku — mowimy o tym wprost, zamiast
 * tworzyc konto, ktorego i tak nie pokazemy klientowi.
 */
export async function convertLeadToDesigner(leadId: string): Promise<LeadActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("landing_leads")
    .select("id, kind, payload, status")
    .eq("id", leadId)
    .single();

  if (!lead) return { ok: false, error: "Nie znaleziono leada." };
  if (lead.kind !== "grafik")
    return { ok: false, error: "Tylko lead typu „grafik” mozna zamienic na grafika." };

  const p = (lead.payload || {}) as Record<string, string>;
  const email = (p.email || "").trim().toLowerCase();
  const displayName = (p.nazwa || p.imie || "").trim();
  const portfolio = (p.portfolio || p.portfolio_url || p.link || "").trim();

  if (!email || !displayName)
    return { ok: false, error: "Lead nie zawiera e-maila lub nazwy." };
  if (!portfolio)
    return {
      ok: false,
      error: "Lead nie zawiera linku do portfolio — dodaj grafika recznie w /admin/graficy.",
    };

  const res = await createDesigner({
    email,
    display_name: displayName,
    city: p.miasto || undefined,
    phone: p.telefon || undefined,
    portfolio_url: portfolio,
    instagram: p.instagram || undefined,
    website: p.www || undefined,
    specializations: p.specjalizacja || undefined,
    software: p.software || undefined,
  });

  if (!res.ok) return { ok: false, error: res.error };

  await admin
    .from("landing_leads")
    .update({ status: "handled", handled_at: new Date().toISOString() })
    .eq("id", leadId);

  revalidatePath("/admin/leady");
  revalidatePath("/admin/graficy");
  revalidatePath("/admin");

  return { ok: true, message: res.message };
}
