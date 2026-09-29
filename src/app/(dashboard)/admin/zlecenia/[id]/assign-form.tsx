"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { assignStudio } from "./actions";
import { labelUslugi, oczyscUslugi, studioPasuje, type Dopasowanie } from "@/lib/uslugi";

interface Studio {
  id: string;
  business_name: string;
  address: string;
  city?: string | null;
  services?: string[] | null;
  specializations: string[]; // „Inne usługi (opis)” — tylko podgląd, nie służy do dobierania
  odleglosc_km?: number | null; // dopisane przez sortujWgOdleglosci (serwer)
}

// bez polskich znaków + małe litery — żeby "lodz" znajdowało "Łódź"
function norm(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

type Sekcja = { klucz: "pasujace" | "bez_uslug" | "nie_robia"; tytul: string; opis?: string };

export function AssignStudioForm({
  orderId,
  studios,
  orderCity,
  orderService,
}: {
  orderId: string;
  studios: Studio[];
  orderCity?: string | null;
  orderService: string;
}) {
  const [selectedStudio, setSelectedStudio] = useState("");
  const [query, setQuery] = useState("");
  const [openList, setOpenList] = useState(false);
  const [pokazNiepasujace, setPokazNiepasujace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [zapytanie, setZapytanie] = useState<string | null>(null); // potwierdzenie wymuszenia
  const router = useRouter();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const usluga = labelUslugi(orderService);

  // Dopasowanie liczymy po stronie klienta tym samym kodem co serwer (studioPasuje);
  // serwer i tak sprawdza to jeszcze raz przy zapisie.
  const opisane = useMemo(
    () => studios.map((s) => ({ s, d: studioPasuje(s.services, orderService) as Dopasowanie })),
    [studios, orderService]
  );
  const bezFiltra = opisane.length > 0 && opisane.every((x) => x.d === "bez_filtra");

  // Studia przychodzą z serwera już posortowane wg odległości od miasta zlecenia;
  // wyszukiwarka tylko zawęża listę (nazwa, miasto, adres) — kolejność zostaje.
  const widoczne = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return opisane;
    return opisane.filter(({ s }) => norm(`${s.business_name} ${s.city ?? ""} ${s.address ?? ""}`).includes(q));
  }, [query, opisane]);

  const sekcje: (Sekcja & { pozycje: typeof widoczne })[] = bezFiltra
    ? [{ klucz: "pasujace", tytul: "Wszystkie studia (po km)", pozycje: widoczne }]
    : [
        { klucz: "pasujace" as const, tytul: "Pasujące", pozycje: widoczne.filter((x) => x.d === "pasuje") },
        {
          klucz: "bez_uslug" as const,
          tytul: "Bez zaznaczonych usług — sprawdź ręcznie",
          opis: "stare studia, usługi jeszcze nieuzupełnione",
          pozycje: widoczne.filter((x) => x.d === "brak_uslug"),
        },
        { klucz: "nie_robia" as const, tytul: "Nie robią tej usługi", pozycje: widoczne.filter((x) => x.d === "nie_robi") },
      ];

  const wybrane = opisane.find((x) => x.s.id === selectedStudio);
  const wybranePasuje = !wybrane || wybrane.d === "pasuje" || wybrane.d === "bez_filtra";

  function wybierz(s: Studio) {
    setSelectedStudio(s.id);
    setQuery(s.business_name);
    setOpenList(false);
    setError("");
    setZapytanie(null);
  }

  async function przypisz(force: boolean) {
    setLoading(true);
    setError("");
    const res = await assignStudio(orderId, selectedStudio, { force });
    setLoading(false);
    if (!res.ok) {
      // Serwer zdecydował, że studio nie pasuje (np. usługi zmienione w międzyczasie) — pytamy o potwierdzenie.
      if (res.wymagaPotwierdzenia) setZapytanie(res.error);
      else setError(res.error);
      return;
    }
    setZapytanie(null);
    router.refresh();
    setSelectedStudio("");
    setQuery("");
  }

  function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudio || !wybrane) return;
    // Niepasujące: najpierw okno potwierdzenia, dopiero potem force=true.
    if (!wybranePasuje) {
      setZapytanie(
        wybrane.d === "brak_uslug"
          ? `${wybrane.s.business_name} nie ma zaznaczonych żadnych usług (potrzebna: ${usluga}).`
          : `${wybrane.s.business_name} nie ma zaznaczonej usługi „${usluga}”.`
      );
      return;
    }
    void przypisz(false);
  }

  const chipy = (s: Studio) => oczyscUslugi(s.services).map((k) => labelUslugi(k));

  return (
    <form onSubmit={handleAssign} className="mt-4 pt-4 border-t border-brand-border">
      <label className="block text-sm font-medium mb-1">
        Przypisz studio
        {orderCity && <span className="text-brand-chrom font-normal"> — sortowane od: {orderCity}</span>}
      </label>
      <p className="text-xs mb-2">
        {bezFiltra ? (
          <span className="text-brand-chrom">Usługa: {usluga} — bez filtra studiów, dobierz ręcznie.</span>
        ) : (
          <span className="text-brand-chrom">
            Wymagana usługa: <strong className="text-brand-lime">{usluga}</strong>
          </span>
        )}
      </p>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            placeholder="Szukaj studia lub miasta..."
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedStudio(""); // zmiana tekstu kasuje wybór, dopóki nie klikniesz pozycji
              setZapytanie(null);
              setOpenList(true);
            }}
            onFocus={() => setOpenList(true)}
            onBlur={() => {
              // opóźnienie, żeby klik w pozycję zdążył się wykonać przed zamknięciem listy
              blurTimer.current = setTimeout(() => setOpenList(false), 150);
            }}
            className="w-full px-4 py-2.5 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition"
          />

          {openList && widoczne.length > 0 && (
            <div className="absolute z-10 mt-1 w-full max-h-96 overflow-auto bg-brand-grafit border border-brand-border rounded-xl shadow-xl">
              {sekcje.map((sek) => {
                if (sek.pozycje.length === 0) return null;
                // „Nie robią” zwinięte, chyba że coś wpisano w wyszukiwarkę albo kliknięto „Pokaż”.
                const zwinieta = sek.klucz === "nie_robia" && !pokazNiepasujace && !query.trim();
                return (
                  <div key={sek.klucz}>
                    <div
                      className={`px-4 py-1.5 text-[11px] uppercase tracking-wide flex items-center justify-between ${
                        sek.klucz === "bez_uslug"
                          ? "text-amber-400 bg-amber-400/5"
                          : sek.klucz === "nie_robia"
                            ? "text-brand-chrom/60"
                            : "text-brand-lime bg-brand-lime/5"
                      }`}
                    >
                      <span>
                        {sek.tytul} ({sek.pozycje.length})
                      </span>
                      {sek.klucz === "nie_robia" && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setPokazNiepasujace((v) => !v)}
                          className="normal-case underline"
                        >
                          {zwinieta ? "Pokaż niepasujące" : "Ukryj"}
                        </button>
                      )}
                    </div>
                    {!zwinieta &&
                      sek.pozycje.map(({ s, d }) => (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()} // nie zabieraj focusa przed kliknięciem
                          onClick={() => wybierz(s)}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-brand-grafit-light transition flex items-center justify-between gap-3 ${
                            s.id === selectedStudio ? "bg-brand-grafit-light" : ""
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-brand-kosc">{s.business_name}</span>
                            <span className="block truncate text-xs text-brand-chrom">{s.city || s.address}</span>
                            {d === "brak_uslug" ? (
                              <span className="block truncate text-xs text-amber-400/90">
                                ⚠ brak zaznaczonych usług
                                {s.specializations?.length ? ` · opis: ${s.specializations.join(", ")}` : ""}
                              </span>
                            ) : (
                              chipy(s).length > 0 && (
                                <span className="block truncate text-xs text-brand-chrom/70">{chipy(s).join(" · ")}</span>
                              )
                            )}
                          </span>
                          {typeof s.odleglosc_km === "number" && (
                            <span className="shrink-0 text-xs font-medium text-brand-lime">{s.odleglosc_km} km</span>
                          )}
                        </button>
                      ))}
                  </div>
                );
              })}
            </div>
          )}

          {openList && query.trim() && widoczne.length === 0 && (
            <div className="absolute z-10 mt-1 w-full bg-brand-grafit border border-brand-border rounded-xl px-4 py-2.5 text-sm text-brand-chrom">
              Brak studia pasującego do „{query}”.
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!selectedStudio || loading}
          className="px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50"
        >
          {loading ? "..." : "Przypisz"}
        </button>
      </div>

      {wybrane && (
        <p className="mt-2 text-xs text-brand-chrom">
          Wybrane: <span className="text-brand-kosc">{wybrane.s.business_name}</span>
          {typeof wybrane.s.odleglosc_km === "number" && orderCity ? ` · ${wybrane.s.odleglosc_km} km od ${orderCity}` : ""}
        </p>
      )}

      {/* Potwierdzenie wymuszenia — studio spoza „pasujących”. Wpis w admin_actions po stronie serwera. */}
      {zapytanie && (
        <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4">
          <p className="text-sm text-amber-300 mb-3">
            {zapytanie} <strong>Przypisać mimo to?</strong>
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => przypisz(true)}
              className="px-4 py-2 bg-amber-400 text-brand-grafit font-bold text-sm rounded-xl hover:bg-amber-400/90 transition disabled:opacity-50"
            >
              {loading ? "..." : "Tak, przypisz mimo to"}
            </button>
            <button
              type="button"
              onClick={() => setZapytanie(null)}
              className="px-4 py-2 text-sm text-brand-chrom hover:text-brand-kosc transition"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </form>
  );
}
