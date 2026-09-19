// Geokodowanie polskich miejscowości + dystans — do sortowania studiów wg
// odległości od miasta zlecenia. Dane: pakiet "polskie-miejscowosci"
// (rejestr PRNG GUS, licencja CC) — ok. 44 tys. miast i wsi ze współrzędnymi.
//
// UWAGA: importowane wyłącznie w komponentach serwerowych (page.tsx).
// Dzięki temu 7 MB danych NIE trafia do bundla wysyłanego do przeglądarki.

import miejscowosci from "polskie-miejscowosci";
// Kody pocztowe -> współrzędne (ok. 22 tys. kodów, github.com/mberezinski/kody-pocztowe-geo, MIT).
// Zapis kompaktowy: "KKKKK" + lat*1e4 (6 cyfr) + lon*1e4 (6 cyfr), rekordy rozdzielone ";".
import kodyPocztowe from "./kody-pocztowe.json";
import { kodZTekstu } from "./kod-pocztowy";

type Rekord = {
  Name: string;
  Type: "village" | "city";
  Province: string;
  Latitude: number;
  Longitude: number;
};

// Minimum potrzebne do liczenia dystansu (rekord miejscowości albo punkt z kodu pocztowego).
type Punkt = { Latitude: number; Longitude: number; Province?: string };

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

// Indeks kod pocztowy ("05090") -> punkt. Budowany raz, jak indeks nazw.
let indeksKodow: Map<string, Punkt> | null = null;
function getIndeksKodow(): Map<string, Punkt> {
  if (indeksKodow) return indeksKodow;
  const m = new Map<string, Punkt>();
  for (const r of (kodyPocztowe as { d: string }).d.split(";")) {
    m.set(r.slice(0, 5), {
      Latitude: Number(r.slice(5, 11)) / 1e4,
      Longitude: Number(r.slice(11, 17)) / 1e4,
    });
  }
  indeksKodow = m;
  return m;
}

// Współrzędne kodu pocztowego z tekstu, jeśli kod jest w bazie.
export function punktZKodu(tekst: string | null | undefined): Punkt | null {
  const k = kodZTekstu(tekst);
  return k ? getIndeksKodow().get(k.replace("-", "")) ?? null : null;
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
export function dystansKm(a: Punkt, b: Punkt): number {
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
// Pozycja studia: kod pocztowy z adresu (jeśli jest), inaczej nazwa miejscowości.
// Studia bez rozpoznanego miasta (odleglosc_km = null) lądują na końcu, alfabetycznie.
export function sortujWgOdleglosci<
  T extends { city?: string | null; address?: string | null; business_name?: string }
>(studia: T[], miastoZlecenia: string | null | undefined): (T & { odleglosc_km: number | null })[] {
  // Zlecenie: najpierw kod pocztowy (np. "05-090 Raszyn"), potem sama nazwa.
  const nazwaZlec = (miastoZlecenia || "").replace(/\d{2}-?\d{3}/, "").trim();
  const zlecNazwa = nazwaZlec ? geokoduj(nazwaZlec) : null;
  const zlec: Punkt | null = punktZKodu(miastoZlecenia) ?? zlecNazwa;
  const wojZlec = zlecNazwa?.Province ?? null;

  const zWynikiem = studia.map((s) => {
    let odleglosc_km: number | null = null;
    if (zlec) {
      const tekst = [s.city, s.address].filter(Boolean).join(", ");
      // 1) kod pocztowy w adresie studia — jednoznaczny
      let rec: Punkt | null = punktZKodu(tekst);
      // 2) nazwa miejscowości (+ województwo z adresu albo zlecenia przy dwuznacznych nazwach)
      if (!rec) {
        const miasto = s.city || miastoZAdresu(s.address);
        const woj = wojewodztwoZAdresu(s.address) ?? wojZlec;
        rec = miasto ? geokoduj(miasto, woj) : null;
      }
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
