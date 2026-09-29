// Słownik usług wykonawców i zleceń — JEDYNE źródło prawdy (brief uslugi-studiow-brief.md).
//
// Nowa usługa = zmiana tutaj + migracja (CHECK na studios.services, wartość enuma
// service_type) + checkbox na landingu (index, dolacz, wrapper) + opcja w select
// klienta (index + podstrony uslugi/*). Nigdy wolny tekst do dobierania.
//
// Moduł bez importów i bez składni spoza "type stripping" — scripts/check-uslugi.mjs
// importuje go wprost zwykłym `node`.

/** Usługi, które studio zaznacza w profilu (kolumna studios.services). */
export type UslugaKod =
  | "zmiana_koloru"
  | "detale"
  | "dechrom"
  | "ppf"
  | "ppf_kolor"
  | "reklama"
  | "szyby"
  | "detailing";

/** Rodzaj zlecenia (orders.service_type) — usługi core + zlecenia bez filtra studiów. */
export type UslugaZlecenia = Exclude<UslugaKod, "detailing"> | "grafika" | "inne";

export type GrupaUslug = "Folie" | "PPF" | "Reklama" | "Szyby" | "Dodatkowo";

export type Usluga = {
  kod: UslugaKod;
  etykieta: string;
  grupa: GrupaUslug;
  /** Liczy się do wymogu „min. 1 usługa”. Sam detailing nie wystarczy. */
  core: boolean;
};

export const USLUGI: readonly Usluga[] = [
  { kod: "zmiana_koloru", etykieta: "Zmiana koloru (full wrap)", grupa: "Folie", core: true },
  { kod: "detale", etykieta: "Oklejanie detali (dach, maska, lusterka)", grupa: "Folie", core: true },
  { kod: "dechrom", etykieta: "Dechroming", grupa: "Folie", core: true },
  { kod: "ppf", etykieta: "PPF bezbarwny (ochrona lakieru)", grupa: "PPF", core: true },
  { kod: "ppf_kolor", etykieta: "PPF kolorowy", grupa: "PPF", core: true },
  { kod: "reklama", etykieta: "Oklejanie reklamowe i branding flot", grupa: "Reklama", core: true },
  { kod: "szyby", etykieta: "Przyciemnianie szyb", grupa: "Szyby", core: true },
  { kod: "detailing", etykieta: "Detailing, ceramika, korekta lakieru", grupa: "Dodatkowo", core: false },
];

export const GRUPY_USLUG: readonly GrupaUslug[] = ["Folie", "PPF", "Reklama", "Szyby", "Dodatkowo"];

export const KODY_USLUG: readonly UslugaKod[] = USLUGI.map((u) => u.kod);
export const CORE_CODES: readonly UslugaKod[] = USLUGI.filter((u) => u.core).map((u) => u.kod);

/** Kolejność i etykiety do selectów „Rodzaj usługi” przy zleceniu (panel admina). */
export const USLUGI_ZLECEN: readonly { kod: UslugaZlecenia; etykieta: string }[] = [
  ...USLUGI.filter((u) => u.core).map((u) => ({ kod: u.kod as UslugaZlecenia, etykieta: u.etykieta })),
  { kod: "grafika", etykieta: "Projekt graficzny" },
  { kod: "inne", etykieta: "Inne" },
];

export const KODY_ZLECEN: readonly UslugaZlecenia[] = USLUGI_ZLECEN.map((u) => u.kod);

/** Dojazd do klienta to cecha (studios.work_mode), nie usługa. */
export const WORK_MODE_U_KLIENTA = "u_klienta";

const ETYKIETY: Record<string, string> = {
  ...Object.fromEntries(USLUGI.map((u) => [u.kod, u.etykieta])),
  grafika: "Projekt graficzny",
  inne: "Inne",
  // Stare wartości orders.service_type (przed migracją 024b) — tylko do odczytu.
  oklejanie: "Oklejanie (zmiana koloru)",
  branding: "Oklejanie reklamowe i branding flot",
};

/** Etykieta usługi studia albo rodzaju zlecenia; nieznany kod wraca bez zmian. */
export function labelUslugi(kod: string | null | undefined): string {
  if (!kod) return "—";
  return ETYKIETY[kod] ?? kod;
}

export function isUslugaKod(v: unknown): v is UslugaKod {
  return typeof v === "string" && (KODY_USLUG as readonly string[]).includes(v);
}

export function isUslugaZlecenia(v: unknown): v is UslugaZlecenia {
  return typeof v === "string" && (KODY_ZLECEN as readonly string[]).includes(v);
}

/** Czy lista usług studia spełnia wymóg „min. 1 usługa core”. */
export function maUslugeCore(services: readonly string[] | null | undefined): boolean {
  return (services ?? []).some((s) => (CORE_CODES as readonly string[]).includes(s));
}

// --- landing → kody -------------------------------------------------------------------

/** Małe litery, bez polskich znaków — do dopasowań tekstu z formularzy. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l");
}

/**
 * Select klienta `usluga` z landingu → orders.service_type.
 * Zastępuje dawne mapServiceType. Nieznany tekst → "inne" (dobór ręczny),
 * a nie domyślne "oklejanie", które wprowadzało w błąd.
 */
export function mapLandingUsluga(tekst: string | null | undefined): UslugaZlecenia {
  const s = norm(tekst || "");
  if (!s.trim()) return "inne";
  if (s.includes("projekt graficzny")) return "grafika";
  // Kolejność ma znaczenie: „PPF kolorowy” zawiera i „ppf”, i „kolor”.
  if (s.includes("ppf") && s.includes("kolor")) return "ppf_kolor";
  if (s.includes("ppf") || s.includes("ochronn")) return "ppf";
  if (s.includes("dechrom")) return "dechrom";
  if (s.includes("szyb") || s.includes("przyciemn")) return "szyby";
  if (s.includes("detal")) return "detale";
  if (s.includes("reklam") || s.includes("branding") || s.includes("flot")) return "reklama";
  if (s.includes("wrap") || s.includes("kolor")) return "zmiana_koloru";
  return "inne";
}

/** Stare nazwy checkboxów `usl_*` z landingu (przed słownikiem). */
const STARE_CHECKBOXY: Record<string, UslugaKod> = {
  usl_wrap: "zmiana_koloru",
  usl_ppf: "ppf",
  usl_reklama: "reklama",
  usl_szyby: "szyby",
  usl_dechrom: "dechrom",
};

function zaznaczony(v: unknown): boolean {
  if (typeof v !== "string") return v === true;
  return ["tak", "on", "true", "1", "yes"].includes(v.trim().toLowerCase());
}

/**
 * Checkboxy usług z formularzy wykonawcy (studio, wrapper, /dolacz) → kody + work_mode.
 * Obsługuje stare nazwy (usl_wrap, usl_reklama, usl_szyby, usl_ppf, usl_dechrom,
 * usl_mobilnie) i nowe (usl_<kod>). `usl_mobilnie` = dojazd do klienta (work_mode).
 */
export function mapLandingCheckboxy(payload: Record<string, unknown> | null | undefined): {
  services: UslugaKod[];
  uKlienta: boolean;
} {
  const p = payload ?? {};
  const out = new Set<UslugaKod>();
  for (const [pole, kod] of Object.entries(STARE_CHECKBOXY)) {
    if (zaznaczony(p[pole])) out.add(kod);
  }
  for (const kod of KODY_USLUG) {
    if (zaznaczony(p[`usl_${kod}`])) out.add(kod);
  }
  return {
    // Kolejność jak w słowniku — stabilny zapis i porównania.
    services: KODY_USLUG.filter((k) => out.has(k)),
    uKlienta: zaznaczony(p.usl_mobilnie),
  };
}

// --- dobór studia do zlecenia -----------------------------------------------------------

/**
 * Reguła zgodności: jakie usługi studia obsługują dany rodzaj zlecenia.
 * Domyślnie 1:1; wyjątki tutaj (łatwe do zmiany).
 */
const OBSLUGUJE: Partial<Record<UslugaZlecenia, readonly UslugaKod[]>> = {
  // Kto robi pełną zmianę koloru, okleja też dach, maskę czy lusterka.
  detale: ["detale", "zmiana_koloru"],
};

/** Stare wartości zlecenia → nowe kody (odczyt sprzed migracji 024b). */
export function normalizujUslugeZlecenia(kod: string | null | undefined): UslugaZlecenia | null {
  if (kod === "oklejanie") return "zmiana_koloru";
  if (kod === "branding") return "reklama";
  return isUslugaZlecenia(kod) ? kod : null;
}

export type Dopasowanie = "pasuje" | "brak_uslug" | "nie_robi" | "bez_filtra";

/**
 * Czy studio pasuje do zlecenia.
 * - bez_filtra: zlecenie grafika/inne/nieznane — dobór ręczny, bez filtra studiów
 * - brak_uslug: studio nie ma żadnej usługi core (stare, nieuzupełnione) — sprawdź ręcznie
 * - pasuje / nie_robi: wg usług studia i reguły OBSLUGUJE
 */
export function studioPasuje(
  studioServices: readonly string[] | null | undefined,
  orderService: string | null | undefined
): Dopasowanie {
  const usluga = normalizujUslugeZlecenia(orderService);
  if (!usluga || usluga === "grafika" || usluga === "inne") return "bez_filtra";
  const services = studioServices ?? [];
  if (!maUslugeCore(services)) return "brak_uslug";
  const akceptowane = OBSLUGUJE[usluga] ?? [usluga as UslugaKod];
  return akceptowane.some((k) => services.includes(k)) ? "pasuje" : "nie_robi";
}
