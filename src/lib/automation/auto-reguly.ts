// Czyste reguły wyboru studiów przy automatycznym przypisaniu (Etap 7, Faza 1) — bez importów,
// sprawdzane przez scripts/check-automat.mjs. Dane (studia, km, dopasowanie usług) liczy
// auto-przypisanie.ts; tu zapada tylko decyzja: komu przypisać albo dlaczego nie.

export type Kandydat = {
  id: string;
  nazwa: string;
  slug: string | null;
  /** Odległość od miasta zlecenia; null = nie rozpoznano miejscowości studia. */
  km: number | null;
  /** studioPasuje(...) === "pasuje" (usługa zlecenia jest na liście studia). */
  pasuje: boolean;
};

export type Decyzja =
  | { przypisz: true; studia: Kandydat[]; promienKm: number | null; powod: string }
  | { przypisz: false; powod: string };

/** Hiline to studio Wojtka — przy automacie nigdy jedyna propozycja. */
export function toHiline(k: Pick<Kandydat, "nazwa" | "slug">): boolean {
  return /hiline/i.test(k.nazwa) || /hiline/i.test(k.slug || "");
}

export function wybierzStudia(
  kandydaci: Kandydat[],
  opts: { promienKm: number; max: number; wykonawcaSlug?: string | null; miastoRozpoznane: boolean }
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

  const wPromieniu = pasujace
    .filter((k) => k.km != null && k.km <= opts.promienKm)
    .sort((a, b) => (a.km as number) - (b.km as number));
  const studia = wPromieniu.slice(0, opts.max);

  if (studia.length === 0) {
    return { przypisz: false, powod: `brak pasujących studiów w promieniu ${opts.promienKm} km` };
  }
  if (studia.length === 1 && toHiline(studia[0])) {
    return { przypisz: false, powod: "jedynym pasującym studiem jest Hiline — nigdy jedyna propozycja" };
  }
  return { przypisz: true, studia, promienKm: opts.promienKm, powod: `${studia.length} najbliższe pasujące` };
}
