// Czyste reguły wyboru studiów przy automatycznym przypisaniu (Etap 7, Fazy 1–2) — bez importów,
// sprawdzane przez scripts/check-automat.mjs. Dane (studia, km, dopasowanie usług, obciążenie)
// liczy auto-przypisanie.ts; tu zapada tylko decyzja: komu przypisać albo dlaczego nie.

export type Kandydat = {
  id: string;
  nazwa: string;
  slug: string | null;
  /** Odległość od miasta zlecenia; null = nie rozpoznano miejscowości studia. */
  km: number | null;
  /** studioPasuje(...) === "pasuje" (usługa zlecenia jest na liście studia). */
  pasuje: boolean;
  /** Aktywne przypisania z ostatnich 7 dni (bez declined/expired/rejected). Brak = 0. */
  obciazenie?: number;
};

export type Decyzja =
  | { przypisz: true; studia: Kandydat[]; promienKm: number | null; powod: string }
  | { przypisz: false; powod: string };

/** Studia bliżej siebie niż tyle km traktujemy jak remis odległości (Faza 2). */
export const PROG_REMISU_KM = 10;

/** Hiline to studio Wojtka — przy automacie nigdy jedyna propozycja. */
export function toHiline(k: Pick<Kandydat, "nazwa" | "slug">): boolean {
  return /hiline/i.test(k.nazwa) || /hiline/i.test(k.slug || "");
}

function przetasuj<T>(lista: T[], losuj: () => number): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(losuj() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Ranking (Faza 2): najpierw odległość, ale studia w odstępie < PROG_REMISU_KM od pierwszego
 * w grupie to remis. W remisie wygrywa mniejsze obciążenie z 7 dni, a przy tym samym
 * obciążeniu kolejność jest losowana — żeby nie wygrywało zawsze to samo studio.
 * Wymaga km != null (studia bez lokalizacji odpadają wcześniej).
 */
export function uszereguj(kandydaci: Kandydat[], losuj: () => number = Math.random): Kandydat[] {
  const wgKm = [...kandydaci].sort((a, b) => (a.km as number) - (b.km as number));
  const wynik: Kandydat[] = [];
  let i = 0;
  while (i < wgKm.length) {
    const start = wgKm[i].km as number;
    const grupa: Kandydat[] = [];
    while (i < wgKm.length && (wgKm[i].km as number) - start < PROG_REMISU_KM) grupa.push(wgKm[i++]);

    const wgObciazenia = new Map<number, Kandydat[]>();
    for (const k of grupa) {
      const o = k.obciazenie ?? 0;
      wgObciazenia.set(o, [...(wgObciazenia.get(o) ?? []), k]);
    }
    for (const o of Array.from(wgObciazenia.keys()).sort((a, b) => a - b)) {
      wynik.push(...przetasuj(wgObciazenia.get(o) as Kandydat[], losuj));
    }
  }
  return wynik;
}

export function wybierzStudia(
  kandydaci: Kandydat[],
  opts: {
    /** Kolejne promienie (Faza 4), np. [50, 100, 200] — rosnąco. */
    promienie: number[];
    max: number;
    wykonawcaSlug?: string | null;
    miastoRozpoznane: boolean;
    /** Etykieta usługi do treści wyjątku. */
    usluga?: string;
    losuj?: () => number;
  }
): Decyzja {
  const pasujace = kandydaci.filter((k) => k.pasuje);

  // Klient wybrał konkretnego wykonawcę w katalogu (pole `wykonawca` z formularza).
  if (opts.wykonawcaSlug) {
    const wybrany = pasujace.find((k) => k.slug === opts.wykonawcaSlug);
    if (!wybrany) {
      return {
        przypisz: false,
        powod: `klient wybrał wykonawcę „${opts.wykonawcaSlug}”, który nie robi tej usługi albo jest niedostępny`,
      };
    }
    // Wybór klienta wygrywa z regułą Hiline — to nie my proponujemy, klient sam wskazał.
    return { przypisz: true, studia: [wybrany], promienKm: null, powod: "wykonawca wskazany przez klienta" };
  }

  if (!opts.miastoRozpoznane) return { przypisz: false, powod: "nie rozpoznano miejscowości zlecenia" };

  // Geo-fallback (Faza 4): najmniejszy promień, w którym jest ktoś poza samym Hiline.
  const promienie = [...opts.promienie].filter((r) => r > 0).sort((a, b) => a - b);
  let tylkoHiline = false;
  for (const promien of promienie) {
    const wPromieniu = pasujace.filter((k) => k.km != null && k.km <= promien);
    const studia = uszereguj(wPromieniu, opts.losuj).slice(0, opts.max);
    if (studia.length === 0) continue;
    if (studia.length === 1 && toHiline(studia[0])) {
      // Hiline nigdy jedyną propozycją — szukamy dalej, czy jest ktoś jeszcze.
      tylkoHiline = true;
      continue;
    }
    return { przypisz: true, studia, promienKm: promien, powod: `${studia.length} najlepsze pasujące w ${promien} km (km, obciążenie)` };
  }

  const max = promienie[promienie.length - 1] ?? 0;
  if (tylkoHiline) {
    return { przypisz: false, powod: `jedynym pasującym studiem w promieniu ${max} km jest Hiline — nigdy jedyna propozycja` };
  }
  return {
    przypisz: false,
    powod: `brak studiów${opts.usluga ? ` z usługą „${opts.usluga}”` : ""} nawet w promieniu ${max} km`,
  };
}
