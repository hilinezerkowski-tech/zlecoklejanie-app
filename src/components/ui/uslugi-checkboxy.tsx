"use client";

// Wybór usług wykonawcy ze słownika (src/lib/uslugi.ts) — jeden komponent
// dla panelu admina (dodawanie/edycja) i profilu studia.
// Walidacja „min. 1 usługa core” jest ZAWSZE po stronie serwera; tu tylko podpowiedź.

import { GRUPY_USLUG, USLUGI, maUslugeCore, type UslugaKod } from "@/lib/uslugi";

export type UslugiValue = {
  services: UslugaKod[];
  uKlienta: boolean;
  /** „Inne usługi (opis)” — wolny tekst po przecinku, tylko do profilu. */
  inne: string;
};

const inputCls =
  "w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition";

export function UslugiCheckboxy({
  value,
  onChange,
  disabled,
}: {
  value: UslugiValue;
  onChange: (v: UslugiValue) => void;
  disabled?: boolean;
}) {
  const brak = !maUslugeCore(value.services);

  function toggle(kod: UslugaKod) {
    const set = new Set(value.services);
    if (set.has(kod)) set.delete(kod);
    else set.add(kod);
    onChange({ ...value, services: USLUGI.map((u) => u.kod).filter((k) => set.has(k)) });
  }

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="block text-xs text-brand-chrom mb-1">
        Usługi * <span className="text-brand-chrom/60">(min. 1 — po nich dobieramy zlecenia)</span>
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {GRUPY_USLUG.map((grupa) => (
          <div key={grupa}>
            <p className="text-[11px] uppercase tracking-wide text-brand-chrom/60 mb-1">{grupa}</p>
            {USLUGI.filter((u) => u.grupa === grupa).map((u) => (
              <label key={u.kod} className="flex items-center gap-2 text-sm text-brand-kosc py-0.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value.services.includes(u.kod)}
                  onChange={() => toggle(u.kod)}
                  className="accent-brand-lime"
                />
                {u.etykieta}
              </label>
            ))}
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-brand-kosc cursor-pointer">
        <input
          type="checkbox"
          checked={value.uKlienta}
          onChange={(e) => onChange({ ...value, uKlienta: e.target.checked })}
          className="accent-brand-lime"
        />
        Dojazd do klienta
      </label>
      <div>
        <label className="block text-xs text-brand-chrom mb-1">
          Inne usługi (opis, po przecinku) <span className="text-brand-chrom/60">— tylko do profilu</span>
        </label>
        <input
          type="text"
          value={value.inne}
          onChange={(e) => onChange({ ...value, inne: e.target.value })}
          placeholder="np. folie architektoniczne, wygłuszanie"
          className={inputCls}
        />
      </div>
      {brak && (
        <p className="text-xs text-amber-400">
          Zaznacz co najmniej jedną usługę — sam detailing nie wystarczy.
        </p>
      )}
    </fieldset>
  );
}
