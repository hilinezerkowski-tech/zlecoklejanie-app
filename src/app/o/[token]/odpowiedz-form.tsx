"use client";

import { useState, useTransition } from "react";
import { doladujZTokenu, odrzucZTokenu, wycenZTokenu } from "./actions";
import { DoladujButton } from "@/components/ui/doladuj-button";
import { POWODY_ODMOWY } from "@/lib/odmowa";
import { BrakPunktow } from "@/components/ui/brak-punktow";

const input =
  "w-full bg-brand-grafit border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-kosc placeholder:text-brand-chrom/50 focus:outline-none focus:border-brand-lime/50 transition";

/** bezPunktow (Gate 1): studio nie ma punktów — zamiast pól wyceny ekran doładowania; odmowa działa (darmowa). */
export function OdpowiedzForm({
  token,
  bezPunktow = false,
  doladowanie = false,
}: {
  token: string;
  bezPunktow?: boolean;
  /** Czy da się doładować online (klucze P24 + pakiet ustawiony). */
  doladowanie?: boolean;
}) {
  const [tryb, setTryb] = useState<"wycena" | "odmowa">("wycena");
  const [brakPunktow, setBrakPunktow] = useState(bezPunktow);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [gotowe, setGotowe] = useState<string | null>(null);

  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [days, setDays] = useState("");
  const [comment, setComment] = useState("");
  const [kod, setKod] = useState("");
  const [notatka, setNotatka] = useState("");

  function wyslij() {
    setError(null);
    start(async () => {
      const r =
        tryb === "wycena"
          ? await wycenZTokenu(token, { priceMin, priceMax, days, comment })
          : await odrzucZTokenu(token, { kod, notatka });
      if (r.ok) setGotowe(r.message);
      else if ("brakPunktow" in r && r.brakPunktow) setBrakPunktow(true);
      else setError(r.error);
    });
  }

  if (gotowe) {
    return (
      <div className="bg-brand-lime/10 border border-brand-lime/30 rounded-2xl p-6 text-sm">
        <p className="font-semibold text-brand-lime mb-1">Gotowe</p>
        <p>{gotowe}</p>
      </div>
    );
  }

  return (
    <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
      <div className="flex gap-2 mb-5" role="tablist">
        {(
          [
            ["wycena", "Wyślij wycenę"],
            ["odmowa", "Nie wezmę tego zlecenia"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tryb === k}
            onClick={() => {
              setTryb(k);
              setError(null);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${
              tryb === k
                ? "bg-brand-lime text-brand-grafit border-brand-lime"
                : "border-brand-border text-brand-chrom hover:text-brand-kosc"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-400/10 border border-red-400/30 text-red-400 text-sm rounded-lg p-3 mb-4">{error}</div>
      )}

      {tryb === "wycena" && brakPunktow ? (
        doladowanie ? (
          <div className="bg-amber-400/10 border border-amber-400/30 rounded-2xl p-6">
            <h2 className="font-semibold text-amber-400 mb-2">Nie masz punktów na wycenę</h2>
            <p className="text-sm text-brand-chrom mb-4">
              Wysłanie wyceny kosztuje 1 punkt. Doładuj punkty — po płatności wrócisz tutaj i wyślesz wycenę. Odmowa jest
              bezpłatna.
            </p>
            <DoladujButton akcja={() => doladujZTokenu(token)} />
          </div>
        ) : (
          <BrakPunktow href="/login" etykieta="Zaloguj się do panelu →" />
        )
      ) : tryb === "wycena" ? (
        <div className="space-y-4">
          <p className="text-sm text-brand-chrom">
            Podaj orientacyjną cenę. Klient porówna maksymalnie 3 oferty i wybierze studio.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="block text-brand-chrom mb-1">Cena od (zł) *</span>
              <input type="number" inputMode="numeric" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="np. 4000" className={input} />
            </label>
            <label className="block text-sm">
              <span className="block text-brand-chrom mb-1">Cena do (zł)</span>
              <input type="number" inputMode="numeric" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="np. 6000" className={input} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="block text-brand-chrom mb-1">Czas realizacji (dni)</span>
            <input type="number" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} placeholder="np. 5" className={input} />
          </label>
          <label className="block text-sm">
            <span className="block text-brand-chrom mb-1">Komentarz dla klienta</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className={input} placeholder="Co obejmuje wycena, jaką folię proponujesz…" />
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-brand-chrom">
            Dzięki za szybką odpowiedź — przekażemy zlecenie innemu studiu. Powód pomaga nam lepiej dobierać zlecenia.
          </p>
          <label className="block text-sm">
            <span className="block text-brand-chrom mb-1">Powód *</span>
            <select value={kod} onChange={(e) => setKod(e.target.value)} className={input}>
              <option value="">— wybierz —</option>
              {POWODY_ODMOWY.map((p) => (
                <option key={p.kod} value={p.kod}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {(kod === "inne" || kod === "za_malo_informacji") && (
            <label className="block text-sm">
              <span className="block text-brand-chrom mb-1">
                {kod === "inne" ? "Napisz krótko dlaczego *" : "Czego brakuje? (opcjonalnie)"}
              </span>
              <textarea value={notatka} onChange={(e) => setNotatka(e.target.value)} rows={2} maxLength={300} className={input} />
            </label>
          )}
        </div>
      )}

      {!(tryb === "wycena" && brakPunktow) && (
      <button
        type="button"
        onClick={wyslij}
        disabled={pending}
        className="mt-5 bg-brand-lime text-brand-grafit font-semibold px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
      >
        {pending ? "Wysyłam…" : tryb === "wycena" ? "Wyślij wycenę" : "Potwierdzam odmowę"}
      </button>
      )}
    </div>
  );
}
