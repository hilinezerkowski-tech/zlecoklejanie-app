// Źródło "Supabase" dla feedu agenta — Faza 1.
// Dwa sygnały: nowe zlecenia bez przypisania i rejestracje wykonawców
// czekające na decyzję (studia/wrapperzy pending, leady utknięte przed
// auto-onboardingiem, freelancerzy z IG którzy odpowiedzieli).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentCard } from "@/app/(dashboard)/admin/agent/types";
import { cityFromAddress, citySlug } from "@/lib/studio-location";
import { labelUslugi, maUslugeCore, oczyscUslugi, studioPasuje } from "@/lib/uslugi";

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

type ActiveStudio = { id: string; business_name: string | null; address: string | null; services: string[] | null };

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
  // Bez studiów z pauzą leadów — tak samo jak lista "Przypisz studio" w panelu zlecenia.
  const { data: studios } = await admin
    .from("studios")
    .select("id, business_name, address, services")
    .eq("status", "active")
    .eq("is_paused", false)
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
    const inCity = (slug ? byCity.get(slug) : undefined) ?? [];
    // Dobór po usłudze (Faza 3): kandydaci tylko „pasujący”; studia bez usług osobno
    // do ręcznego sprawdzenia; niepasujących nie proponujemy w ogóle.
    const bezFiltra = studioPasuje([], order.service_type) === "bez_filtra";
    const matches = bezFiltra ? [] : inCity.filter((s) => studioPasuje(s.services, order.service_type) === "pasuje");
    const bezUslug = bezFiltra ? [] : inCity.filter((s) => studioPasuje(s.services, order.service_type) === "brak_uslug");
    const names = matches.slice(0, 3).map((s) => s.business_name || "bez nazwy");
    const nearest = matches.slice(0, 2).map((s) => s.id);
    const uslugaTxt = labelUslugi(order.service_type);

    const carPart = [order.car_brand, order.car_model].filter(Boolean).join(" ");
    const client = order.client;
    const clientLine = client
      ? [client.full_name, client.email, client.phone].filter(Boolean).join(", ")
      : "brak danych klienta";
    const photoCount = Array.isArray(order.photos) ? order.photos.length : 0;

    const facts = [
      `Klient: ${clientLine}`,
      `Usługa: ${labelUslugi(order.service_type)}${
        order.scope ? `, ${scopeLabels[order.scope] || order.scope}` : ""
      }`,
      `Miasto: ${order.city}`,
      photoCount > 0 ? `Zdjęcia: ${photoCount} załącznik${photoCount === 1 ? "" : "i"}` : "Zdjęcia: brak",
      `Zlecenie czeka: ${ageLabel(order.created_at)}`,
      bezFiltra
        ? "Usługa nieokreślona — dobór ręczny"
        : `Studia z usługą „${uslugaTxt}” w regionie: ${matches.length}${names.length ? ` (${names.join(", ")})` : ""}`,
      ...(bezUslug.length > 0
        ? [`Studia bez zaznaczonych usług w regionie (do sprawdzenia): ${bezUslug.map((s) => s.business_name || "bez nazwy").join(", ")}`]
        : []),
    ];

    const suggestion = bezFiltra
      ? `Usługa „${uslugaTxt}” nie ma filtra studiów — dobierz wykonawcę ręcznie w panelu zlecenia.`
      : matches.length > 0
        ? `W „${order.city}” usługę „${uslugaTxt}” robi ${matches.length} studio${
            matches.length === 1 ? "" : "a"
          }. Przypisz najbliższe.`
        : `Brak studiów z usługą „${uslugaTxt}” w „${order.city}”${
            bezUslug.length > 0
              ? ` — sprawdź studia bez zaznaczonych usług: ${bezUslug.map((s) => s.business_name || "bez nazwy").join(", ")}`
              : " — sprawdź sąsiednie miasta ręcznie"
          }. Bez przycisku przypisania.`;

    const actions: AgentCard["actions"] = [];
    if (nearest.length > 0) {
      actions.push({
        kind: "assign_studio",
        label: names.length > 1 ? `Przypisz ${names.slice(0, 2).join(" + ")}` : `Przypisz ${names[0]}`,
        primary: true,
        payload: { orderId: order.id, studioIds: nearest },
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
  services: string[] | null;
  specializations: string[] | null;
  provider_type: string | null;
  created_at: string;
  profile: { email: string | null; phone: string | null } | null;
};

export async function fetchPendingStudioCards(admin: SupabaseClient): Promise<AgentCard[]> {
  const { data } = await admin
    .from("studios")
    .select(
      "id, business_name, address, instagram, website, services, specializations, provider_type, created_at, profile:profiles!studios_id_fkey(email, phone)"
    )
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as unknown as PendingStudioRow[];

  return rows.map((s) => {
    const isFreelancer = s.provider_type === "freelancer";
    const hasPortfolio = Boolean(s.instagram || s.website);
    // Usługi ze słownika — bez nich aktywacja jest zablokowana (serwer + trigger 024c).
    const hasSpecializations = maUslugeCore(s.services);
    const missing: string[] = [];
    if (!hasPortfolio) missing.push("Instagram/WWW");
    if (!hasSpecializations) missing.push("usługi");
    if (!s.address) missing.push("adres");

    const facts = [
      `Typ: ${isFreelancer ? "wrapper mobilny" : "studio"}`,
      `Usługi: ${hasSpecializations ? oczyscUslugi(s.services).map(labelUslugi).join(", ") : "nie zaznaczono"}`,
      ...(s.specializations?.length ? [`Inne (opis): ${s.specializations.join(", ")}`] : []),
      s.instagram ? `Instagram: @${s.instagram}` : s.website ? `WWW: ${s.website}` : "Portfolio: brak",
      `Kontakt: ${[s.profile?.email, s.profile?.phone].filter(Boolean).join(", ") || "brak"}`,
      missing.length > 0 ? `Braki w profilu: ${missing.join(", ")}` : "Profil kompletny",
    ];

    const suggestion =
      hasPortfolio && hasSpecializations
        ? "Profil wygląda kompletnie — aktywuj konto."
        : "Brak portfolio albo zaznaczonych usług — poproś o uzupełnienie przed aktywacją.";

    const actions: AgentCard["actions"] = [];
    if (hasPortfolio && hasSpecializations) {
      actions.push({ kind: "activate_studio", label: "Aktywuj konto", primary: true, payload: { studioId: s.id } });
    } else {
      actions.push({
        kind: "request_info",
        label: hasPortfolio ? "Poproś o usługi" : "Poproś o uzupełnienie",
        primary: true,
        payload: { studioId: s.id },
        draft: `Cześć${s.business_name ? " " + s.business_name : ""}, dzięki za rejestrację na ZlecOklejanie.pl. Żeby aktywować konto, ${[
          !hasPortfolio && "podeślij proszę link do Instagrama albo swojej strony z realizacjami",
          !hasSpecializations && "zaznacz w panelu (Mój profil → Usługi), co robisz — po tym dobieramy zlecenia",
        ]
          .filter(Boolean)
          .join(" i ")}. Odpisz na tego maila i aktywuję konto tego samego dnia.`,
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

type PendingDesignerRow = {
  id: string;
  display_name: string | null;
  city: string | null;
  portfolio_url: string | null;
  instagram: string | null;
  specializations: string[] | null;
  works_on_vehicle_templates: boolean | null;
  price_from: number | null;
  price_to: number | null;
  monthly_capacity: number | null;
  created_at: string;
  profile: { email: string | null; phone: string | null } | null;
};

/**
 * Graficy po auto-onboardingu (src/lib/onboarding.ts) zostają na status='pending'
 * do ręcznej weryfikacji portfolio — tak samo jak studia.
 */
export async function fetchPendingDesignerCards(admin: SupabaseClient): Promise<AgentCard[]> {
  const { data } = await admin
    .from("designers")
    .select(
      "id, display_name, city, portfolio_url, instagram, specializations, works_on_vehicle_templates, price_from, price_to, monthly_capacity, created_at, profile:profiles!designers_id_fkey(email, phone)"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as unknown as PendingDesignerRow[];

  return rows.map((d) => {
    const hasPortfolio = Boolean(d.portfolio_url || d.instagram);
    const price =
      d.price_from || d.price_to ? `${d.price_from ?? "?"}–${d.price_to ?? "?"} zł` : "nie podano";

    const facts = [
      "Typ: grafik",
      d.portfolio_url ? `Portfolio: ${d.portfolio_url}` : d.instagram ? `Instagram: @${d.instagram}` : "Portfolio: brak",
      `Specjalizacje: ${d.specializations?.length ? d.specializations.join(", ") : "nie podano"}`,
      `Szablony pojazdów: ${d.works_on_vehicle_templates ? "TAK" : "nie zaznaczono"}`,
      `Widełki za projekt: ${price}`,
      `Przepustowość: ${d.monthly_capacity ? `${d.monthly_capacity} projektów/mies.` : "nie podano"}`,
      `Kontakt: ${[d.profile?.email, d.profile?.phone].filter(Boolean).join(", ") || "brak"}`,
    ];

    const actions: AgentCard["actions"] = [];
    if (hasPortfolio) {
      actions.push({ kind: "activate_designer", label: "Aktywuj grafika", primary: true, payload: { designerId: d.id } });
    }
    actions.push({ kind: "open", label: "Zobacz w panelu", href: "/admin/graficy?status=pending" });
    actions.push({ kind: "dismiss", label: "Później" });

    return {
      id: `designer:${d.id}`,
      type: "new_studio",
      priority: hasPortfolio ? "normal" : "low",
      source: "Supabase",
      occurredAt: d.created_at,
      title: `${d.display_name || "Bez nazwy"} — nowa rejestracja grafika${d.city ? ", " + d.city : ""}`,
      facts,
      suggestion: hasPortfolio
        ? "Obejrzyj portfolio — jeśli prace dotyczą oklejania pojazdów, aktywuj konto."
        : "Brak portfolio — bez prac nie kierujemy briefów. Napisz do grafika z prośbą o link.",
      actions,
    } satisfies AgentCard;
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
