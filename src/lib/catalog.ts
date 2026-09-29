import { createPublicClient } from "@/lib/supabase/public";
import { cityFromAddress, citySlug } from "@/lib/studio-location";
import type { StudioCardData } from "@/components/ui/studio-card";
import { FILTR_U_KLIENTA, USLUGI, WORK_MODE_U_KLIENTA, isUslugaKod, labelUslugi, oczyscUslugi } from "@/lib/uslugi";

export type CatalogStudio = StudioCardData & {
  id: string;
  citySlugValue: string | null;
  cityName: string | null;
};

// Pobiera aktywne studia + agregat ocen z opinii (published).
export async function getCatalogStudios(): Promise<CatalogStudio[]> {
  const supabase = createPublicClient();

  const { data: studios } = await supabase
    .from("studios")
    .select(
      "id, slug, business_name, description, address, services, work_mode, specializations, provider_type, portfolio, google_rating, google_reviews_count"
    )
    .eq("status", "active")
    .is("deleted_at", null);

  const rows = (studios ?? []) as unknown as (StudioCardData & {
    id: string;
    address: string | null;
  })[];

  // Agregacja opinii
  const { data: reviews } = await supabase
    .from("reviews")
    .select("studio_id, rating")
    .eq("status", "published");

  const agg = new Map<string, { sum: number; n: number }>();
  for (const r of (reviews ?? []) as { studio_id: string; rating: number }[]) {
    const a = agg.get(r.studio_id) ?? { sum: 0, n: 0 };
    a.sum += r.rating;
    a.n += 1;
    agg.set(r.studio_id, a);
  }

  return rows
    .filter((s) => s.slug)
    .map((s) => {
      const a = agg.get(s.id);
      const cityName = cityFromAddress(s.address);
      return {
        ...s,
        reviewAvg: a ? a.sum / a.n : null,
        reviewCount: a ? a.n : 0,
        cityName,
        citySlugValue: citySlug(s.address),
      };
    });
}

// Sortowanie: najpierw z portfolio i ocenami (pełniejsze profile wyżej)
export function sortStudios(list: CatalogStudio[]): CatalogStudio[] {
  return [...list].sort((a, b) => {
    const score = (s: CatalogStudio) =>
      (s.portfolio?.length ? 2 : 0) + (s.reviewCount ? 1 : 0);
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return (a.business_name || "").localeCompare(b.business_name || "", "pl");
  });
}

export type CatalogFilters = {
  q?: string;
  miasto?: string; // slug miasta
  usluga?: string;
  typ?: string;
};

export function filterStudios(
  list: CatalogStudio[],
  f: CatalogFilters
): CatalogStudio[] {
  return list.filter((s) => {
    if (f.miasto && s.citySlugValue !== f.miasto) return false;
    if (f.typ && (s.provider_type ?? "studio") !== f.typ) return false;
    // Filtr usług = słownik (src/lib/uslugi.ts) + „Dojazd do klienta” (work_mode).
    // Stare wartości ?usluga=<tekst> (sprzed słownika) nie pasują do niczego — jak nieznany filtr.
    if (f.usluga) {
      if (f.usluga === FILTR_U_KLIENTA) {
        if (!(s.work_mode || []).includes(WORK_MODE_U_KLIENTA)) return false;
      } else if (!isUslugaKod(f.usluga) || !oczyscUslugi(s.services).includes(f.usluga)) {
        return false;
      }
    }
    if (f.q) {
      const hay = [
        s.business_name,
        s.description,
        s.cityName,
        ...oczyscUslugi(s.services).map(labelUslugi),
        ...(s.specializations || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    return true;
  });
}

// Unikalne miasta (nazwa + slug) posortowane, z liczbą studiów
export function cityIndex(
  list: CatalogStudio[]
): { name: string; slug: string; count: number }[] {
  const m = new Map<string, { name: string; count: number }>();
  for (const s of list) {
    if (!s.citySlugValue || !s.cityName) continue;
    const e = m.get(s.citySlugValue) ?? { name: s.cityName, count: 0 };
    e.count += 1;
    m.set(s.citySlugValue, e);
  }
  return Array.from(m.entries())
    .map(([slug, v]) => ({ slug, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pl"));
}

// Filtry usług: 8 pozycji słownika + „Dojazd do klienta”, zawsze w tej samej kolejności,
// z liczbą studiów. Pozycje bez studiów zostają (pusty wynik jest uczciwszy niż znikający filtr).
export function serviceIndex(list: CatalogStudio[]): { value: string; label: string; count: number }[] {
  const opcje = USLUGI.map((u) => ({
    value: u.kod as string,
    label: u.etykieta,
    count: list.filter((s) => oczyscUslugi(s.services).includes(u.kod)).length,
  }));
  opcje.push({
    value: FILTR_U_KLIENTA,
    label: "Dojazd do klienta",
    count: list.filter((s) => (s.work_mode || []).includes(WORK_MODE_U_KLIENTA)).length,
  });
  return opcje;
}
