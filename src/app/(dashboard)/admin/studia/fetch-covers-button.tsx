"use client";

import { useState, useTransition } from "react";
import { fetchMissingCovers, type CoverResult } from "./cover-actions";

export function FetchCoversButton() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<CoverResult | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setRes(await fetchMissingCovers()))}
        className="rounded-lg border border-brand-border px-3 py-2 text-sm font-semibold text-brand-kosc hover:border-brand-lime disabled:opacity-50"
      >
        {pending ? "Pobieram zdjęcia…" : "Pobierz zdjęcia ze stron www"}
      </button>
      {res && (
        <p className="max-w-xs text-right text-xs text-brand-chrom">
          {res.ok
            ? `Sprawdzono ${res.checked}, znaleziono ${res.found}.${res.missing.length ? ` Bez zdjęcia: ${res.missing.join(", ")}.` : ""}`
            : `Błąd: ${res.error}`}
        </p>
      )}
    </div>
  );
}
