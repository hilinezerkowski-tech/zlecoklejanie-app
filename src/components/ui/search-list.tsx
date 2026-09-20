"use client";

import { useMemo, useRef, useState } from "react";

export type SearchRow = {
  key: string;
  /** Tekst przeszukiwany — wszystko, po czym admin może chcieć znaleźć wiersz. */
  text: string;
  /** Gotowy wiersz (renderowany po stronie serwera, tutaj tylko filtrowany). */
  node: React.ReactNode;
};

/**
 * Uproszczenie tekstu do porównania: małe litery, bez polskich znaków.
 * Dzięki temu „lodz" znajduje „Łódź", a „krakow" — „Kraków".
 * `ł` nie rozkłada się przez NFD, więc podmieniamy je osobno.
 */
function uprosc(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Lista z wyszukiwarką filtrującą w locie (bez przeładowania strony).
 *
 * Wiersze przychodzą gotowe z komponentu serwerowego — tutaj decydujemy
 * wyłącznie o tym, które pokazać. Listy admina liczą dziesiątki pozycji,
 * więc filtrowanie po stronie przeglądarki jest natychmiastowe i nie
 * wymaga rundy do serwera na każdą literę.
 *
 * Gdy podano `head`, wiersze renderują się jako <tbody> tabeli.
 */
export function SearchList({
  rows,
  placeholder,
  head,
  listClassName = "space-y-4",
  emptyText = "Brak wyników",
}: {
  rows: SearchRow[];
  placeholder: string;
  head?: React.ReactNode;
  listClassName?: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = uprosc(query.trim());
    if (!q) return rows;
    // Każde słowo osobno — „wrap krakow" znajdzie studio z obu fragmentów.
    const slowa = q.split(/\s+/);
    return rows.filter((r) => {
      const t = uprosc(r.text);
      return slowa.every((w) => t.includes(w));
    });
  }, [rows, query]);

  const nodes = filtered.map((r) => (
    <FilteredRow key={r.key}>{r.node}</FilteredRow>
  ));

  return (
    <div>
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-chrom/60 pointer-events-none">
          🔍
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full pl-10 pr-24 py-2.5 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition"
        />
        {query && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-chrom">
            {filtered.length} z {rows.length}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-10 text-center">
          <p className="text-brand-chrom">{emptyText}</p>
          <button
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="mt-2 text-sm text-brand-lime hover:underline"
          >
            Wyczyść wyszukiwanie
          </button>
        </div>
      ) : head ? (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl overflow-x-auto">
          <table className="w-full">
            {head}
            <tbody>{nodes}</tbody>
          </table>
        </div>
      ) : (
        <div className={listClassName}>{nodes}</div>
      )}
    </div>
  );
}

/** Przezroczysty wrapper — nadaje klucz bez dotykania samego wiersza. */
function FilteredRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
