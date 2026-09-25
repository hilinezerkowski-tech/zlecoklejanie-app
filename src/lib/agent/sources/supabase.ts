// Źródło "Supabase" dla feedu agenta — Faza 1.
// Dwa sygnały: nowe zlecenia bez przypisania i rejestracje wykonawców
// czekające na decyzję (studia/wrapperzy pending, leady utknięte przed
// auto-onboardingiem, freelancerzy z IG którzy odpowiedzieli).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentCard } from "@/app/(dashboard)/admin/agent/types";
import { cityFromAddress, citySlug } from "@/lib/studio-location";

const serviceLabels: Record<string, string> = {
  oklejanie: "Oklejanie",
  ppf: "PPF",
  branding: "Branding",
  grafika: "Grafika",
  inne: "Inne",
};

const scopeLabels: Record<string, string> = {
  full: "całe auto",
  full_wneki: "całe auto + wnęki",
  partial: "częściowe",
  front: "przód",
};

function ageLabel(iso: string): string {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} godz.`;
  return `${Math.round(h / 24)} dni`;
}

// --- Zlecenia bez przypisania -----------------------------------------------

type OrderRow = {
  id: string;
  service_type: string;
  scope: string | null;
  car_brand: string | null;
  car_model: string | null;
  city: string;
  photos: string[] | null;
  created_at: string;
  client: { email: string | null; full_name: string | null; phone: string | null } | null;
};

type ActiveStudio = { id: string; business_name: string | null; address: string | null };

export async function fetchNewOrderCards(admin: SupabaseClient): Promise<AgentCard[]> {
  const { data: orders } = await admin
    .from("orders")
    .select(
      "id, service_type, scope, car_brand, car_model, city, photos, created_at, client:profiles!orders_client_id_fkey(email, full_name, phone)"
    )
    .eq("status", "new")
    .order("created_at", { ascending: true });

  const rows = (orders ?? []) as unknown as OrderRow[];
  if (rows.length === 0) return [];

  // "bez przypisania" sprawdzone też przez order_assignments, nie tylko status —
  // status 'new' powinien to gwarantować, ale to tania, dodatkowa pewność.
  const { data: assignments } = await admin
    .from("order_assignments")
    .select("order_id")
    .in(
      "order_id",
      rows.map((o) => o.id)
    );
  const assignedIds = new Set((assignments ?? []).map((a: { order_id: string }) => a.order_id));
  const unassigned = rows.filter((o) => !assignedIds.has(o.id));
  if (unassigned.length === 0) return [];

  // Aktywne studia, raz dla wszystkich kart — dopasowanie po mieście z adresu.
  const { data: studios } = await admin
    .from("studios")
    .select("id, business_name, address")
    .eq("status", "active")
    .is("deleted_at", null);
  const activeStudios = (studios ?? []) as ActiveStudio[];
  const byCity = new Map<string, ActiveStudio[]>();
  for (const s of activeStudios) {
    const slug = citySlug(cityFromAddress(s.address));
    if (!slug) continue;
    const list = byCity.get(slug) ?? [];
    list.push(s);
    byCity.set(slug, list);
  }

  return unassigned.map((order) => {
    const slug = citySlug(order.city);
    const matches = (slug ? byCity.get(slug) : undefined) ?? [];
    const names = matches.slice(0, 3).map((s) => s.business_name || "bez nazwy");
    const nearest = matches.slice(0, 2).map((s) => s.id);

    const carPart = [order.car_brand, order.car_model].filter(Boolean).join(" ");
    const client = order.client;
    const clientLine = client
      ? [client.full_name, client.email, client.phone].filter(Boolean).join(", ")
      : "brak danych klienta";
    const photoCount = Array.isArray(order.photos) ? order.photos.length : 0;

    const facts = [
      `Klient: ${clientLine}`,
      `Usługa: ${serviceLabels[order.service_type] || order.service_type}${
        order.scope ? `, ${scopeLabels[order.scope] || order.scope}` : ""
      }`,
      `Miasto: ${order.city}`,
      photoCount > 0 ? `Zdjęcia: ${photoCount} załącznik${photoCount === 1 ? "" : "i"}` : "Zdjęcia: brak",
      `Zlecenie czeka: ${ageLabel(order.created_at)}`,
      `Aktywne studia w regionie: ${matches.length}${names.length ? ` (${names.join(", ")})` : ""}`,
    ];

    const suggestion =
      matches.length > 0
        ? `W „${order.city}” działa${matches.length === 1 ? "" : "ją"} ${matches.length} aktywne studio${
            matches.length === 1 ? "" : "a"
          }. Przypisz najbliższe.`
        : `Brak aktywnych studiów w „${order.city}” — sprawdź sąsiednie miasta ręcznie, zanim przypiszesz.`;

    const actions: AgentCard["actions"] = [];
    if (nearest.length > 0) {
      actions.push({
        kind: "assign_studio",
        label: names.length > 1 ? `Przypisz ${names.slice(0, 2).join(" + ")}` : `Przypisz ${names[0]}`,
        primary: true,
      });
    }
    actions.push({ kind: "open", label: "Otwórz zlecenie", href: `/admin/zlecenia/${order.id}` });
    actions.push({ kind: "dismiss", label: "Później" });

    const card: AgentCard = {
      id: `order:${order.id}`,
      type: "new_order",
      priority: "high",
      source: "Supabase",
      occurredAt: order.created_at,
      title: carPart ? `${carPart} — ${order.city}` : `Zlecenie — ${order.city}`,
      facts,
      suggestion,
      actions,
    };
    return card;
  });
}

// --- Rejestracje wykonawców ---------------------------------------------------

type PendingStudioRow = {
  id: string;
  business_name: string | null;
  address: string | null;
  instagram: string | null;
  website: string | null;
  specializations: string[] | null;
  provider_type: string | null;
  created_at: string;
  profile: { email: string | null; phone: string | null } | null;
};

export async function fetchPendingStudioCards(admin: SupabaseClient): Promise<AgentCard[]> {
  const { data } = await admin
    .from("studios")
    .select(
      "id, business_name, address, instagram, website, specializations, provider_type, created_at, profile:profiles!studios_id_fkey(email, phone)"
    )
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as unknown as PendingStudioRow[];

  return rows.map((s) => {
    const isFreelancer = s.provider_type === "freelancer";
    const hasPortfolio = Boolean(s.instagram || s.website);
    const hasSpecializations = (s.specializations?.length ?? 0) > 0;
    const missing: string[] = [];
    if (!hasPortfolio) missing.push("Instagram/WWW");
    if (!hasSpecializations) missing.push("specjalizacje");
    if (!s.address) missing.push("adres");

    const facts = [
      `Typ: ${isFreelancer ? "wrapper mobilny" : "studio"}`,
      `Usługi: ${hasSpecializations ? s.specializations!.join(", ") : "nie podano"}`,
      s.instagram ? `Instagram: @${s.instagram}` : s.website ? `WWW: ${s.website}` : "Portfolio: brak",
      `Kontakt: ${[s.profile?.email, s.profile?.phone].filter(Boolean).join(", ") || "brak"}`,
      missing.length > 0 ? `Braki w profilu: ${missing.join(", ")}` : "Profil kompletny",
    ];

    const suggestion =
      hasPortfolio && hasSpecializations
        ? "Profil wygląda kompletnie — aktywuj konto."
        : "Brak portfolio albo specjalizacji — poproś o uzupełnienie przed aktywacją.";

    const actions: AgentCard["actions"] = [];
    if (hasPortfolio && hasSpecializations) {
      actions.push({ kind: "activate_studio", label: "Aktywuj konto", primary: true });
    } else {
      actions.push({
        kind: "request_info",
        label: "Poproś o portfolio",
        primary: true,
        draft: `Cześć${s.business_name ? " " + s.business_name : ""}, dzięki za rejestrację na ZlecOklejanie.pl. Żeby aktywować konto, podeślij proszę link do Instagrama albo swojej strony z realizacjami. Odpisz na tego maila i aktywuję konto tego samego dnia.`,
      });
    }
    actions.push({
      kind: "open",
      label: "Zobacz profil",
      href: isFreelancer ? `/admin/studia/${s.id}` : `/admin/studia/${s.id}`,
    });
    actions.push({ kind: "dismiss", label: "Później" });

    const card: AgentCard = {
      id: `studio:${s.id}`,
      type: "new_studio",
      priority: hasPortfolio ? "normal" : "low",
      source: "Supabase",
      occurredAt: s.created_at,
      title: `${s.business_name || "Bez nazwy"} — nowa rejestracja${
        cityFromAddress(s.address) ? ", " + cityFromAddress(s.address) : ""
      }`,
      facts,
      suggestion,
      actions,
    };
    return card;
  });
}

type StuckLeadRow = {
  id: string;
  kind: string;
  payload: Record<string, string> | null;
  created_at: string;
};

/**
 * Leady studio/grafik/wrapper, które NIE przeszły auto-onboardingu
 * (patrz src/lib/onboarding.ts) — zostały na status='new' bez konta.
 * Bez tego admin nie widzi ich nigdzie poza /admin/leady.
 */
export async function fetchStuckLandingLeadCards(admin: SupabaseClient): Promise<AgentCard[]> {
  const { data } = await admin
    .from("landing_leads")
    .select("id, kind, payload, created_at")
    .eq("status", "new")
    .in("kind", ["studio", "grafik", "wykonawca-freelancer"])
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as unknown as StuckLeadRow[];
  const kindLabel: Record<string, string> = {
    studio: "studio",
    grafik: "grafik",
    "wykonawca-freelancer": "wrapper mobilny",
  };

  return rows.map((lead) => {
    const p = lead.payload || {};
    const name = p.nazwa || p.imie || "bez nazwy";
    const facts = [
      `Typ: ${kindLabel[lead.kind] || lead.kind}`,
      `Nazwa/imię: ${name}`,
      p.miasto ? `Miasto: ${p.miasto}` : "Miasto: nie podano",
      p.instagram || p.portfolio ? `Portfolio: ${p.instagram || p.portfolio}` : "Portfolio: brak",
      `Kontakt: ${[p.email, p.telefon].filter(Boolean).join(", ") || "brak"}`,
      "Nie przeszedł automatycznego zakładania konta — wymaga ręcznej obsługi w skrzynce leadów.",
    ];

    const card: AgentCard = {
      id: `lead:${lead.id}`,
      type: "new_studio",
      priority: "normal",
      source: "Supabase",
      occurredAt: lead.created_at,
      title: `${name} — zgłoszenie utknęło przed kontem (${kindLabel[lead.kind] || lead.kind})`,
      facts,
      suggestion: "Auto-onboarding pominął to zgłoszenie — sprawdź ręcznie w skrzynce leadów i załóż konto albo odrzuć.",
      actions: [
        { kind: "open", label: "Otwórz w skrzynce leadów", href: "/admin/leady?status=new" },
        { kind: "dismiss", label: "Później" },
      ],
    };
    return card;
  });
}

type RespondedFreelancerLead = {
  id: string;
  handle: string | null;
  name: string | null;
  city: string | null;
  phone: string | null;
  instagram_url: string | null;
  notes: string | null;
  contacted_at: string | null;
  created_at: string;
};

/**
 * Freelancerzy namierzeni na IG (rekrutacja wychodząca), którzy odpowiedzieli
 * na DM — czekają, aż Wojtek zarejestruje ich jako wrapperów.
 */
export async function fetchRespondedFreelancerCards(admin: SupabaseClient): Promise<AgentCard[]> {
  const { data } = await admin
    .from("freelancer_leads")
    .select("id, handle, name, city, phone, instagram_url, notes, contacted_at, created_at")
    .eq("status", "odpowiedzial")
    .order("contacted_at", { ascending: true, nullsFirst: true });

  const rows = (data ?? []) as RespondedFreelancerLead[];

  return rows.map((lead) => {
    const label = lead.name || lead.handle || "wrapper z Instagrama";
    const facts = [
      `Instagram: ${lead.handle ? "@" + lead.handle : lead.instagram_url || "brak"}`,
      lead.city ? `Miasto: ${lead.city}` : "Miasto: nie podano",
      lead.phone ? `Telefon: ${lead.phone}` : "Telefon: brak",
      lead.notes ? `Notatki: ${lead.notes}` : "Notatki: brak",
    ];

    const card: AgentCard = {
      id: `freelancer:${lead.id}`,
      type: "new_studio",
      priority: "normal",
      source: "Instagram",
      occurredAt: lead.contacted_at || lead.created_at,
      title: `${label} odpowiedział na DM — gotowy do rejestracji`,
      facts,
      suggestion: "Odpisał na wiadomość rekrutacyjną. Zarejestruj jako wrappera albo umów następny krok.",
      actions: [
        { kind: "open", label: "Zobacz w leadach freelancerów", href: "/admin/leady-freelancer" },
        { kind: "dismiss", label: "Później" },
      ],
    };
    return card;
  });
}
