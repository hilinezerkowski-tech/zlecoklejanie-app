// Miasto wykonawcy na stronach publicznych (katalog, strony miast, profil) + odmiana nazw miast.
//
// Osobny moduł od studio-location.ts: cityFromAddress/citySlug są używane także w doborze
// studiów (podmiana.ts) i w agencie — ich zachowania tu nie zmieniamy. Ten moduł służy tylko
// do WYŚWIETLANIA: jest odporny na bałagan w adresach („Brzeg, 49-300 woj. opolskie",
// „32-540 TRZEBINIA", „51-416 Wroclaw") i zwraca kanoniczny zapis nazwy.
//
// Bez danych geograficznych (7 MB) — można importować także na dynamicznej stronie profilu.

import { slugifyPl } from "@/lib/studio-location";

type Miasto = {
  /** Kanoniczny zapis nazwy. */
  nazwa: string;
  /** Miejscownik z przyimkiem: „w Krakowie", „we Wrocławiu". */
  w: string;
};

// Klucz = slug (slugifyPl). Nowe miasto bez wpisu działa dalej: nazwa wg zapisu z adresu,
// a zamiast miejscownika pojawia się neutralne „w miejscowości X".
const MIASTA: Record<string, Miasto> = {
  // 10 miast z cennikami na landingu
  warszawa: { nazwa: "Warszawa", w: "w Warszawie" },
  krakow: { nazwa: "Kraków", w: "w Krakowie" },
  wroclaw: { nazwa: "Wrocław", w: "we Wrocławiu" },
  poznan: { nazwa: "Poznań", w: "w Poznaniu" },
  gdansk: { nazwa: "Gdańsk", w: "w Gdańsku" },
  lodz: { nazwa: "Łódź", w: "w Łodzi" },
  katowice: { nazwa: "Katowice", w: "w Katowicach" },
  szczecin: { nazwa: "Szczecin", w: "w Szczecinie" },
  lublin: { nazwa: "Lublin", w: "w Lublinie" },
  bydgoszcz: { nazwa: "Bydgoszcz", w: "w Bydgoszczy" },
  // pozostałe miasta wojewódzkie i duże ośrodki
  bialystok: { nazwa: "Białystok", w: "w Białymstoku" },
  rzeszow: { nazwa: "Rzeszów", w: "w Rzeszowie" },
  kielce: { nazwa: "Kielce", w: "w Kielcach" },
  olsztyn: { nazwa: "Olsztyn", w: "w Olsztynie" },
  opole: { nazwa: "Opole", w: "w Opolu" },
  torun: { nazwa: "Toruń", w: "w Toruniu" },
  "zielona-gora": { nazwa: "Zielona Góra", w: "w Zielonej Górze" },
  "gorzow-wielkopolski": { nazwa: "Gorzów Wielkopolski", w: "w Gorzowie Wielkopolskim" },
  gdynia: { nazwa: "Gdynia", w: "w Gdyni" },
  sopot: { nazwa: "Sopot", w: "w Sopocie" },
  radom: { nazwa: "Radom", w: "w Radomiu" },
  czestochowa: { nazwa: "Częstochowa", w: "w Częstochowie" },
  sosnowiec: { nazwa: "Sosnowiec", w: "w Sosnowcu" },
  gliwice: { nazwa: "Gliwice", w: "w Gliwicach" },
  zabrze: { nazwa: "Zabrze", w: "w Zabrzu" },
  bytom: { nazwa: "Bytom", w: "w Bytomiu" },
  tychy: { nazwa: "Tychy", w: "w Tychach" },
  chorzow: { nazwa: "Chorzów", w: "w Chorzowie" },
  "ruda-slaska": { nazwa: "Ruda Śląska", w: "w Rudzie Śląskiej" },
  rybnik: { nazwa: "Rybnik", w: "w Rybniku" },
  "dabrowa-gornicza": { nazwa: "Dąbrowa Górnicza", w: "w Dąbrowie Górniczej" },
  "bielsko-biala": { nazwa: "Bielsko-Biała", w: "w Bielsku-Białej" },
  "tarnowskie-gory": { nazwa: "Tarnowskie Góry", w: "w Tarnowskich Górach" },
  myslowice: { nazwa: "Mysłowice", w: "w Mysłowicach" },
  jaworzno: { nazwa: "Jaworzno", w: "w Jaworznie" },
  plock: { nazwa: "Płock", w: "w Płocku" },
  elblag: { nazwa: "Elbląg", w: "w Elblągu" },
  koszalin: { nazwa: "Koszalin", w: "w Koszalinie" },
  slupsk: { nazwa: "Słupsk", w: "w Słupsku" },
  kalisz: { nazwa: "Kalisz", w: "w Kaliszu" },
  legnica: { nazwa: "Legnica", w: "w Legnicy" },
  walbrzych: { nazwa: "Wałbrzych", w: "w Wałbrzychu" },
  "jelenia-gora": { nazwa: "Jelenia Góra", w: "w Jeleniej Górze" },
  tarnow: { nazwa: "Tarnów", w: "w Tarnowie" },
  "nowy-sacz": { nazwa: "Nowy Sącz", w: "w Nowym Sączu" },
  wloclawek: { nazwa: "Włocławek", w: "we Włocławku" },
  grudziadz: { nazwa: "Grudziądz", w: "w Grudziądzu" },
  inowroclaw: { nazwa: "Inowrocław", w: "w Inowrocławiu" },
  "piotrkow-trybunalski": { nazwa: "Piotrków Trybunalski", w: "w Piotrkowie Trybunalskim" },
  pabianice: { nazwa: "Pabianice", w: "w Pabianicach" },
  zgierz: { nazwa: "Zgierz", w: "w Zgierzu" },
  konin: { nazwa: "Konin", w: "w Koninie" },
  pila: { nazwa: "Piła", w: "w Pile" },
  leszno: { nazwa: "Leszno", w: "w Lesznie" },
  gniezno: { nazwa: "Gniezno", w: "w Gnieźnie" },
  "ostrow-wielkopolski": { nazwa: "Ostrów Wielkopolski", w: "w Ostrowie Wielkopolskim" },
  "grodzisk-wielkopolski": { nazwa: "Grodzisk Wielkopolski", w: "w Grodzisku Wielkopolskim" },
  siedlce: { nazwa: "Siedlce", w: "w Siedlcach" },
  pruszkow: { nazwa: "Pruszków", w: "w Pruszkowie" },
  piaseczno: { nazwa: "Piaseczno", w: "w Piasecznie" },
  legionowo: { nazwa: "Legionowo", w: "w Legionowie" },
  zabki: { nazwa: "Ząbki", w: "w Ząbkach" },
  marki: { nazwa: "Marki", w: "w Markach" },
  raszyn: { nazwa: "Raszyn", w: "w Raszynie" },
  lady: { nazwa: "Łady", w: "w Ładach" },
  stargard: { nazwa: "Stargard", w: "w Stargardzie" },
  goleniow: { nazwa: "Goleniów", w: "w Goleniowie" },
  swidnica: { nazwa: "Świdnica", w: "w Świdnicy" },
  lubin: { nazwa: "Lubin", w: "w Lubinie" },
  glogow: { nazwa: "Głogów", w: "w Głogowie" },
  olesnica: { nazwa: "Oleśnica", w: "w Oleśnicy" },
  brzeg: { nazwa: "Brzeg", w: "w Brzegu" },
  zagan: { nazwa: "Żagań", w: "w Żaganiu" },
  zamosc: { nazwa: "Zamość", w: "w Zamościu" },
  chelm: { nazwa: "Chełm", w: "w Chełmie" },
  przemysl: { nazwa: "Przemyśl", w: "w Przemyślu" },
  krosno: { nazwa: "Krosno", w: "w Krośnie" },
  mielec: { nazwa: "Mielec", w: "w Mielcu" },
  debica: { nazwa: "Dębica", w: "w Dębicy" },
  tarnobrzeg: { nazwa: "Tarnobrzeg", w: "w Tarnobrzegu" },
  "stalowa-wola": { nazwa: "Stalowa Wola", w: "w Stalowej Woli" },
  trzebinia: { nazwa: "Trzebinia", w: "w Trzebini" },
  wieliczka: { nazwa: "Wieliczka", w: "w Wieliczce" },
  rumia: { nazwa: "Rumia", w: "w Rumi" },
  wejherowo: { nazwa: "Wejherowo", w: "w Wejherowie" },
  tczew: { nazwa: "Tczew", w: "w Tczewie" },
  suwalki: { nazwa: "Suwałki", w: "w Suwałkach" },
  lomza: { nazwa: "Łomża", w: "w Łomży" },
  elk: { nazwa: "Ełk", w: "w Ełku" },
  kolobrzeg: { nazwa: "Kołobrzeg", w: "w Kołobrzegu" },
  // mniejsze miejscowości, w których są już wykonawcy
  lack: { nazwa: "Łąck", w: "w Łącku" },
  miekowo: { nazwa: "Miękowo", w: "w Miękowie" },
  lubogoszcz: { nazwa: "Lubogoszcz", w: "w Lubogoszczy" },
  sieroslaw: { nazwa: "Sierosław", w: "w Sierosławiu" },
  droszkow: { nazwa: "Droszków", w: "w Droszkowie" },
  "wola-krzysztoporska": { nazwa: "Wola Krzysztoporska", w: "w Woli Krzysztoporskiej" },
};

// Dzielnice i przyległe wsie zapisywane w adresie razem z miastem → strona miasta.
const ALIASY: Record<string, string> = {
  "szczecin-mierzyn": "szczecin",
};

const WOJEWODZTWA = new Set([
  "dolnoslaskie", "kujawsko-pomorskie", "lubelskie", "lubuskie", "lodzkie",
  "malopolskie", "mazowieckie", "opolskie", "podkarpackie", "podlaskie",
  "pomorskie", "slaskie", "swietokrzyskie", "warminsko-mazurskie",
  "wielkopolskie", "zachodniopomorskie",
]);

/** 10 miast, które mają strony z cennikami na landingu (`/uslugi/<usługa>-<slug>`). */
export const MIASTA_Z_CENNIKIEM: readonly string[] = [
  "warszawa", "krakow", "wroclaw", "poznan", "gdansk",
  "lodz", "katowice", "szczecin", "lublin", "bydgoszcz",
];

const SPOJNIKI = new Set(["nad", "pod", "na", "w", "we", "i", "koło", "k."]);

// „TRZEBINIA" / „tarnowskie góry" → „Trzebinia" / „Tarnowskie Góry" (także człony po myślniku).
function kapitalizuj(v: string): string {
  return v
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) =>
      i > 0 && SPOJNIKI.has(w)
        ? w
        : w
            .split("-")
            .map((c) => c.charAt(0).toUpperCase() + c.slice(1))
            .join("-")
    )
    .join(" ");
}

// Człon adresu bez kodu pocztowego, nawiasów i dopisku „woj. …".
function czyscCzlon(czlon: string): string {
  return czlon
    .replace(/\d{2}-\d{3}/g, " ")
    .replace(/\(.*?\)|\(.*$/g, " ")
    .replace(/(^|\s)woj\.?\s*\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type MiastoStudia = { nazwa: string; slug: string };

/**
 * Miasto wykonawcy z pola `studios.address`. Idzie od ostatniego członu (po przecinkach),
 * pomija sam kod pocztowy i nazwę województwa. Zwraca null, gdy miasta nie da się ustalić
 * (np. sam numer domu po kodzie) — lepszy brak miasta niż strona miasta „Woj. Opolskie".
 */
export function miastoStudia(address: string | null | undefined): MiastoStudia | null {
  if (!address) return null;
  const czlony = address.split(",").map((c) => c.trim()).filter(Boolean);

  for (let i = czlony.length - 1; i >= 0; i--) {
    let s = czyscCzlon(czlony[i]);
    if (!s) continue; // sam kod pocztowy albo „woj. …"
    if (WOJEWODZTWA.has(slugifyPl(s))) continue; // „łódzkie"
    if (/^\d/.test(s)) return null; // numer domu w miejscu miasta — adres do poprawy
    if (/^(ul|al|pl|os)\.?\s/i.test(s) || /^(ulica|aleja|plac|osiedle)\s/i.test(s)) return null;
    // „Lubogoszcz 37" (wieś bez ulicy) → „Lubogoszcz"
    s = s.replace(/\s+\d+\s*[a-zA-Z]?(?:\/\d+\s*[a-zA-Z]?)?$/, "").trim();
    if (!s || /\d/.test(s)) return null;

    const surowy = slugifyPl(s);
    if (!surowy) return null;
    const slug = ALIASY[surowy] ?? surowy;
    return { slug, nazwa: MIASTA[slug]?.nazwa ?? kapitalizuj(s) };
  }
  return null;
}

/** Kanoniczna nazwa miasta po slugu (dla 10 miast z cennikami działa zawsze). */
export function nazwaMiasta(slug: string): string | null {
  return MIASTA[slug]?.nazwa ?? null;
}

/**
 * „w Krakowie" / „we Wrocławiu". Dla miejscowości spoza słownika — neutralne
 * „w miejscowości Brzeziny", żeby nie zgadywać odmiany.
 */
export function wMiescie(nazwa: string | null | undefined): string {
  if (!nazwa) return "";
  const m = MIASTA[ALIASY[slugifyPl(nazwa)] ?? slugifyPl(nazwa)];
  return m ? m.w : `w miejscowości ${nazwa}`;
}

/** Linki do trzech cenników landingu dla miasta, które je ma. */
export function linkiCennikow(slug: string): { href: string; label: string }[] {
  if (!MIASTA_Z_CENNIKIEM.includes(slug)) return [];
  const n = MIASTA[slug]?.nazwa ?? slug;
  const base = "https://zlecoklejanie.pl/uslugi";
  return [
    { href: `${base}/oklejanie-${slug}`, label: `Oklejanie samochodu ${n} — ceny` },
    { href: `${base}/ppf-${slug}`, label: `Folia PPF ${n} — cennik` },
    { href: `${base}/oklejanie-flot-${slug}`, label: `Oklejanie flot ${n} — cennik` },
  ];
}
