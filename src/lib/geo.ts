// Geokodowanie polskich miejscowości + dystans — do sortowania studiów wg
// odległości od miasta zlecenia. Dane: pakiet "polskie-miejscowosci"
// (rejestr PRNG GUS, licencja CC) — ok. 44 tys. miast i wsi ze współrzędnymi.
//
// UWAGA: importowane wyłącznie w komponentach serwerowych (page.tsx).
// Dzięki temu 7 MB danych NIE trafia do bundla wysyłanego do przeglądarki.

import miejscowosci from "polskie-miejscowosci";

type Rekord = {
  Name: string;
  Type: "village" | "city";
  Province: string;
  Latitude: number;
  Longitude: number;
};

// 16 województw (znormalizowane) — do odrzucania członów adresu typu "łódzkie",
// które nie są miejscowością, tylko regionem.
const WOJEWODZTWA = new Set([
  "dolnoslaskie", "kujawsko-pomorskie", "lubelskie", "lubuskie", "lodzkie",
  "malopolskie", "mazowieckie", "opolskie", "podkarpackie", "podlaskie",
  "pomorskie", "slaskie", "swietokrzyskie", "warminsko-mazurskie",
  "wielkopolskie", "zachodniopomorskie",
]);

// Normalizacja: usuwa polskie znaki, sprowadza do małych liter.
// Dzięki temu "Łódź", "lodz" i "LODZ" trafiają do tego samego klucza.
function norm(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Indeks nazwa -> rekordy budowany raz i cache'owany na poziomie modułu
// (Next.js współdzieli moduł między żądaniami w tej samej instancji funkcji).
let indeks: Map<string, Rekord[]> | null = null;
function getIndeks(): Map<string, Rekord[]> {
  if (indeks) return indeks;
  const m = new Map<string, Rekord[]>();
  for (const r of miejscowosci as Rekord[]) {
    const k = norm(r.Name);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  indeks = m;
  return m;
}

// Znajdź współrzędne miejscowości. Gdy nazwa jest niejednoznaczna (np. "Sierosław"
// występuje 4× w Polsce): najpierw dopasuj po województwie, potem preferuj miasto.
export function geokoduj(nazwa: string, wojewodztwo?: string | null): Rekord | null {
  if (!nazwa) return null;
  const kand = getIndeks().get(norm(nazwa));
  if (!kand || kand.length === 0) return null;
  if (wojewodztwo) {
    const wg = kand.filter((k) => norm(k.Province) === norm(wojewodztwo));
    if (wg.length) return wg[0];
  }
  const miasta = kand.filter((k) => k.Type === "city");
  return miasta[0] ?? kand[0];
}

// Wyłuskaj miasto z niejednolitego adresu ("ul. Świteziańki 36, Łódź",
// "Sierosław, wielkopolskie", "Zgierz"). Rozbija po przecinkach, czyści prefiksy
// ulic i numery domów, zwraca pierwszy człon będący znaną miejscowością.
export function miastoZAdresu(address: string | null | undefined): string | null {
  if (!address) return null;
  const idx = getIndeks();
  const trafienia: { nazwa: string; typ: Rekord["Type"] }[] = [];
  for (let czlon of address.split(/[,/]/)) {
    // kod pocztowy ("05-090 Raszyn") -> zostaje sama nazwa
    czlon = czlon.replace(/\b\d{2}-\d{3}\b/g, "").trim();
    // człon z ulicą ("ul. Długa 48") pomijamy w całości — inaczej nazwa ulicy
    // bywa brana za wieś o tej samej nazwie (np. "Długa")
    if (/^(ul|al|pl|os)\.?\s/i.test(czlon) || /\d/.test(czlon)) continue;
    if (!czlon || WOJEWODZTWA.has(norm(czlon))) continue;
    const rec = idx.get(norm(czlon));
    if (rec && rec.length) {
      const miasto = rec.find((r) => r.Type === "city") ?? rec[0];
      trafienia.push({ nazwa: czlon, typ: miasto.Type });
    }
  }
  const miasto = trafienia.find((t) => t.typ === "city");
  return (miasto ?? trafienia[0])?.nazwa ?? null;
}

// Województwo wpisane w adres ("..., Łady, mazowieckie") — do rozstrzygania
// dwuznacznych nazw miejscowości. Zwraca oryginalny zapis lub null.
function wojewodztwoZAdresu(address: string | null | undefined): string | null {
  if (!address) return null;
  for (const czlon of address.split(/[,/]/)) {
    if (WOJEWODZTWA.has(norm(czlon))) return czlon.trim();
  }
  return null;
}

// Odległość po powierzchni Ziemi (wzór haversine), w kilometrach, zaokrąglona.
export function dystansKm(a: Rekord, b: Rekord): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.Latitude - a.Latitude);
  const dLon = toRad(b.Longitude - a.Longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.Latitude)) * Math.cos(toRad(b.Latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// Posortuj studia rosnąco wg odległości od miasta zlecenia i dopisz pole odleglosc_km.
// Miasto studia bierzemy z kolumny `city`, a gdy pusta — parsujemy z `address`.
// Studia bez rozpoznanego miasta (odleglosc_km = null) lądują na końcu, alfabetycznie.
export function sortujWgOdleglosci<
  T extends { city?: string | null; address?: string | null; business_name?: string }
>(studia: T[], miastoZlecenia: string | null | undefined): (T & { odleglosc_km: number | null })[] {
  const zlec = miastoZlecenia ? geokoduj(miastoZlecenia) : null;

  const zWynikiem = studia.map((s) => {
    let odleglosc_km: number | null = null;
    if (zlec) {
      const miasto = s.city || miastoZAdresu(s.address);
      // brak województwa w adresie -> przy dwuznacznej nazwie preferuj woj. zlecenia
      const woj = wojewodztwoZAdresu(s.address) ?? zlec.Province;
      const rec = miasto ? geokoduj(miasto, woj) : null;
      if (rec) odleglosc_km = dystansKm(zlec, rec);
    }
    return { ...s, odleglosc_km };
  });

  zWynikiem.sort((a, b) => {
    if (a.odleglosc_km == null && b.odleglosc_km == null)
      return (a.business_name || "").localeCompare(b.business_name || "", "pl");
    if (a.odleglosc_km == null) return 1;
    if (b.odleglosc_km == null) return -1;
    return a.odleglosc_km - b.odleglosc_km;
  });

  return zWynikiem;
}
