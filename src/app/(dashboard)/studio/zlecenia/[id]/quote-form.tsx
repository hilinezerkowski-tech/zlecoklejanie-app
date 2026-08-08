"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full bg-brand-grafit border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-kosc placeholder:text-brand-chrom/50 focus:outline-none focus:border-brand-lime/50 transition";

export function QuoteForm({
  orderId,
  studioId,
  assignmentId,
}: {
  orderId: string;
  studioId: string;
  assignmentId: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [days, setDays] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);

    const min = parseInt(priceMin, 10);
    if (!priceMin || isNaN(min) || min <= 0) {
      setError("Podaj poprawną cenę minimalną.");
      return;
    }
    const max = priceMax ? parseInt(priceMax, 10) : null;
    if (max !== null && (isNaN(max) || max < min)) {
      setError("Cena maksymalna nie może być niższa od minimalnej.");
      return;
    }
    const estDays = days ? parseInt(days, 10) : null;

    setLoading(true);

    // Zapisz wycenę. Zmianę statusów zlecenia/przypisania oraz powiadomienie
    // dla klienta obsługuje trigger SECURITY DEFINER po stronie bazy
    // (studio nie ma uprawnień RLS do edycji orders/order_assignments).
    const { error: quoteError } = await supabase.from("quotes").insert({
      order_id: orderId,
      studio_id: studioId,
      assignment_id: assignmentId,
      price_min: min,
      price_max: max,
      estimated_days: estDays,
      comment: comment.trim() || null,
    });

    if (quoteError) {
      setLoading(false);
      setError("Nie udało się wysłać wyceny. Spróbuj ponownie.");
      return;
    }

    // Powiadomienie e-mail do klienta o nowej ofercie (best-effort)
    fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "quoted", orderId }),
    }).catch(() => {});

    router.refresh();
  }

  return (
    <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
      <h2 className="font-semibold mb-1">Wyślij wycenę</h2>
      <p className="text-sm text-brand-chrom mb-5">
        Podaj orientacyjną cenę. Klient porówna maksymalnie 3 oferty i wybierze
        studio.
      </p>

      {error && (
        <div className="bg-red-400/10 border border-red-400/30 text-red-400 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Field label="Cena od (zł) *">
          <input
            type="number"
            inputMode="numeric"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            placeholder="np. 4000"
            className={inputClass}
          />
        </Field>
        <Field label="Cena do (zł)">
          <input
            type="number"
            inputMode="numeric"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder="np. 6000"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="mb-4">
        <Field label="Czas realizacji (dni)">
          <input
            type="number"
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="np. 5"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Komentarz dla klienta">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="Zakres prac, rodzaj folii, warunki gwarancji…"
          className={`${inputClass} resize-none`}
        />
      </Field>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="mt-5 w-full px-6 py-3 bg-brand-lime text-brand-grafit font-bold rounded-xl disabled:opacity-50 transition"
      >
        {loading ? "Wysyłanie…" : "Wyślij wycenę"}
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-brand-chrom uppercase tracking-wide mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
