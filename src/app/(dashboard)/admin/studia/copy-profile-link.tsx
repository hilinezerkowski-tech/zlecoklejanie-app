"use client";
import { useState } from "react";

// Link do publicznego profilu wykonawcy /wykonawca/{slug} + kopiowanie do schowka.
// Argument rekrutacyjny: admin wkleja wrapperowi link do jego własnej strony w DM.
export function CopyProfileLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Starsza przeglądarka / brak uprawnień — fallback: zaznacz przez prompt
      window.prompt("Skopiuj link:", url);
    }
  }

  return (
    <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-brand-chrom mb-1">
          Profil publiczny (link do DM rekrutacyjnych)
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-brand-lime hover:underline break-all"
        >
          {url}
        </a>
      </div>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-lg bg-brand-lime px-4 py-2 text-sm font-semibold text-brand-grafit hover:opacity-90"
      >
        {copied ? "Skopiowano ✓" : "Kopiuj link"}
      </button>
    </div>
  );
}
