// Geografia katalogu publicznego: wykonawcy w promieniu od miasta, lista stron miast,
// najbliższy cennik z landingu. TYLKO po stronie serwera (strony katalogu, sitemapa) —
// importuje geo.ts z danymi miejscowości (7 MB), więc nie wolno go wciągać do komponentów
// klienckich ani do dynamicznej strony profilu.

import { dystansKm, geokoduj, punktZKodu } from "@/lib/geo";
import { cityIndex, czyPustyProfil, type CatalogStudio } from "@/lib/catalog";
import { MIASTA_Z_CENNIKIEM, nazwaMiasta } from "@/lib/miasta";

type Punkt = NonNullable<ReturnType<typeof punktZKodu>>;

/** Promień sekcji „W promieniu … km" na stronie miasta. Landing liczy tak samo. */
export const PROMIEN_KM = 50;
/** Do jakiej odległości podpowiadamy cennik sąsiedniego dużego miasta. */
const PROMIEN_CENNIKA_KM = 60;

const WOJEWODZTWA = [
  "dolnośląskie", "kujawsko-pomorskie", "lubelskie", "lubuskie", "łódzkie",
  "małopolskie", "mazowieckie", "opolskie", "podkarpackie", "podlaskie",
  "pomorskie", "śląskie", "świętokrzyskie", "warmińsko-mazurskie",
  "wielkopolskie", "zachodniopomorskie",
];

// Województwo wpisane w adres („Sierosław, łódzkie") — rozstrzyga dwuznaczne nazwy wsi.
function wojZAdresu(address: string | null | undefined): string | null {
  const a = (address || "").toLowerCase();
  return WOJEWODZTWA.find((w) => a.includes(w)) ?? null;
}

// Położenie wykonawcy: kod pocztowy z adresu (jednoznaczny), inaczej nazwa miejscowości.
export function punktStudia(s: Pick<CatalogStudio, "address" | "cityName">): Punkt | null {
  return punktZKodu(s.address) ?? (s.cityName ? geokoduj(s.cityName, wojZAdresu(s.address)) : null);
}

// Środek miasta: rejestr miejscowości; dla wsi o dwuznacznej nazwie — położenie lokalnego studia.
function srodekMiasta(nazwa: string, lokalne: CatalogStudio[]): Punkt | null {
  const rec = geokoduj(nazwa);
  if (rec && rec.Type === "city") return rec;
  for (const s of lokalne) {
    const p = punktStudia(s);
    if (p) return p;
  }
  return rec;
}

export type StudioWPoblizu = CatalogStudio & { km: number };

export type StronaMiasta = {
  slug: string;
  name: string;
  /** Wykonawcy z tej miejscowości. */
  lokalne: CatalogStudio[];
  /** Wykonawcy z innych miejscowości w promieniu PROMIEN_KM, od najbliższego. */
  blisko: StudioWPoblizu[];
  /** false = strona zostaje, ale z noindex i poza sitemapą (nie ma czego pokazać). */
  indexable: boolean;
  /** Cennik na landingu: własny (km = 0) albo najbliższego dużego miasta. */
  cennik: { slug: string; name: string; km: number } | null;
};

/**
 * Wszystkie strony miast katalogu:
 *  - każda miejscowość, w której jest co najmniej jeden wykonawca,
 *  - 10 miast z cennikami na landingu, jeśli w promieniu PROMIEN_KM jest ktokolwiek
 *    (np. Katowice: wykonawcy z Zabrza, Bytomia i Tychów) — landing linkuje do tych stron.
 */
export function stronyMiast(all: CatalogStudio[]): StronaMiasta[] {
  const miasta = cityIndex(all).map((c) => ({ slug: c.slug, name: c.name }));
  for (const slug of MIASTA_Z_CENNIKIEM) {
    const name = nazwaMiasta(slug);
    if (name && !miasta.some((m) => m.slug === slug)) miasta.push({ slug, name });
  }

  const punkty = new Map<string, Punkt | null>();
  for (const s of all) punkty.set(s.id, punktStudia(s));

  const cenniki = MIASTA_Z_CENNIKIEM.map((slug) => {
    const name = nazwaMiasta(slug) ?? slug;
    return { slug, name, punkt: geokoduj(name) as Punkt | null };
  });

  const strony: StronaMiasta[] = [];
  for (const m of miasta) {
    const lokalne = all.filter((s) => s.citySlugValue === m.slug);
    const srodek = srodekMiasta(m.name, lokalne);

    const blisko: StudioWPoblizu[] = [];
    if (srodek) {
      for (const s of all) {
        if (s.citySlugValue === m.slug) continue;
        const p = punkty.get(s.id);
        if (!p) continue;
        const km = dystansKm(srodek, p);
        if (km <= PROMIEN_KM) blisko.push({ ...s, km });
      }
      blisko.sort(
        (a, b) => a.km - b.km || (a.business_name || "").localeCompare(b.business_name || "", "pl")
      );
    }

    if (lokalne.length === 0 && blisko.length === 0) continue; // nie ma czego pokazać

    let cennik: StronaMiasta["cennik"] = null;
    if (MIASTA_Z_CENNIKIEM.includes(m.slug)) {
      cennik = { slug: m.slug, name: m.name, km: 0 };
    } else if (srodek) {
      for (const c of cenniki) {
        if (!c.punkt) continue;
        const km = dystansKm(srodek, c.punkt);
        if (km <= PROMIEN_CENNIKA_KM && (!cennik || km < cennik.km)) {
          cennik = { slug: c.slug, name: c.name, km };
        }
      }
    }

    strony.push({
      slug: m.slug,
      name: m.name,
      lokalne,
      blisko,
      indexable: [...lokalne, ...blisko].some((s) => !czyPustyProfil(s)),
      cennik,
    });
  }

  return strony.sort(
    (a, b) => b.lokalne.length - a.lokalne.length || a.name.localeCompare(b.name, "pl")
  );
}

/** Element ItemList (schema.org) dla karty wykonawcy — strony-listy katalogu. */
export function listItemLd(s: CatalogStudio, position: number, siteUrl: string) {
  const image = s.portfolio?.[0]?.url || s.cover_url || null;
  return {
    "@type": "ListItem",
    position,
    item: {
      "@type": s.provider_type === "freelancer" ? "AutoDetailing" : "AutoBodyShop",
      name: s.business_name ?? "Wykonawca",
      url: `${siteUrl}/wykonawca/${s.slug}`,
      ...(s.cityName
        ? { address: { "@type": "PostalAddress", addressLocality: s.cityName, addressCountry: "PL" } }
        : {}),
      ...(image ? { image } : {}),
    },
  };
}
