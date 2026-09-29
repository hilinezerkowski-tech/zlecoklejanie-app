"use client";

// Baner zgody + ładowanie analityki na stronach PUBLICZNYCH (katalog i profile wykonawców).
// Dwa równorzędne przyciski, zgoda z landingu (ten sam klucz localStorage) działa tutaj,
// link „Ustawienia cookies” (dowolny element z data-cookie-settings) ponownie otwiera baner.
// Zdarzenia: elementy z data-track="<zdarzenie>" (+ data-slug) wysyłają je po kliknięciu.

import { useEffect, useState } from "react";
import { applyConsent, readConsent, saveConsent, track, type Consent } from "@/lib/analytics";

const btn =
  "w-[170px] rounded-md border border-brand-lime bg-transparent px-5 py-2.5 text-sm font-semibold text-brand-lime hover:bg-brand-lime/10";

export function PublicAnalytics() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = readConsent();
    if (saved === "granted") applyConsent("granted");
    else if (!saved) setOpen(true);

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest) return;
      if (target.closest("[data-cookie-settings]")) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      const el = target.closest<HTMLElement>("[data-track]");
      if (el) {
        const params: Record<string, string> = {};
        if (el.dataset.slug) params.slug = el.dataset.slug;
        if (el.dataset.kind) params.kind = el.dataset.kind;
        track(el.dataset.track as string, params);
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  function choose(choice: Consent) {
    saveConsent(choice);
    applyConsent(choice);
    setOpen(false);
  }

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-label="Zgoda na pliki cookie"
      className="fixed inset-x-0 bottom-0 z-[99999] flex justify-center bg-[rgba(11,16,20,.92)] px-6 py-4 backdrop-blur"
    >
      <div className="flex w-full max-w-[860px] flex-wrap items-center gap-5 max-sm:flex-col max-sm:text-center">
        <p className="m-0 flex-[1_1_400px] text-sm leading-relaxed text-[#f4f1e9]">
          Narzędzi analitycznych (Google&nbsp;Analytics, Microsoft&nbsp;Clarity) używamy wyłącznie za Twoją zgodą —
          bez niej nie ładujemy ich wcale. Możesz zmienić decyzję w każdej chwili („Ustawienia cookies” w stopce).
          Szczegóły:{" "}
          <a href="/polityka-prywatnosci" className="text-[#c8f04a] underline">
            Polityka prywatności
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2.5 max-sm:w-full max-sm:flex-wrap max-sm:justify-center">
          <button type="button" className={btn} onClick={() => choose("granted")}>
            Akceptuję
          </button>
          <button type="button" className={btn} onClick={() => choose("denied")}>
            Tylko niezbędne
          </button>
        </div>
      </div>
    </div>
  );
}
