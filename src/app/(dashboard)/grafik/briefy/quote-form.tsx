"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendDesignerQuote } from "@/app/actions/designer-quotes";

export type IstniejacaWycena = {
  price_min: number;
  price_max: number | null;
  estimated_days: number | null;
  comment: string | null;
  status: string;
};

const inputCls =
  "w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-base sm:text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition";

/**
 * Wycena projektu przez grafika. Dopóki klient nie wybrał, wycenę można
 * poprawiać — wtedy formularz startuje z zapisanymi wartościami.
 */
export function DesignerQuoteForm({
  assignmentId,
  quote,
}: {
  assignmentId: string;
  quote: IstniejacaWycena | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!quote);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    price_min: quote ? String(quote.price_min) : "",
    price_max: quote?.price_max != null ? String(quote.price_max) : "",
    estimated_days: quote?.estimated_days != null ? String(quote.estimated_days) : "",
    comment: quote?.comment || "",
  });

  async function wyslij(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    const res = await sendDesignerQuote(assignmentId, {
      price_min: Number(form.price_min),
      price_max: form.price_max === "" ? null : Number(form.price_max),
      estimated_days: form.estimated_days === "" ? null : Number(form.estimated_days),
      comment: form.comment,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error || "Nieznany błąd.");
      return;
    }
    setSuccess(res.message || "Wysłano.");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="mt-4 pt-4 border-t border-brand-border">
        {success && <p className="mb-2 text-sm text-brand-lime">✓ {success}</p>}
        {quote?.status === "sent" && (
          <button
            onClick={() => setOpen(true)}
            className="text-sm text-brand-lime hover:underline"
          >
            Popraw wycenę
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={wyslij} className="mt-4 pt-4 border-t border-brand-border space-y-4">
      <p className="text-sm font-medium">
        {quote ? "Popraw wycenę" : "Wyceń ten projekt"}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-brand-chrom mb-1">Cena od (zł) *</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            required
            value={form.price_min}
            onChange={(e) => setForm({ ...form, price_min: e.target.value })}
            placeholder="800"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-brand-chrom mb-1">Cena do (zł)</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={form.price_max}
            onChange={(e) => setForm({ ...form, price_max: e.target.value })}
            placeholder="1200"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-brand-chrom mb-1">Realizacja (dni)</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={form.estimated_days}
            onChange={(e) => setForm({ ...form, estimated_days: e.target.value })}
            placeholder="5"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-brand-chrom mb-1">
          Co obejmuje wycena
        </label>
        <textarea
          rows={4}
          value={form.comment}
          onChange={(e) => setForm({ ...form, comment: e.target.value })}
          placeholder="Np. dwie wizualizacje, poprawki, pliki produkcyjne w krzywych."
          className={inputCls}
        />
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50"
        >
          {loading ? "Wysyłam..." : quote ? "Zapisz wycenę" : "Wyślij wycenę"}
        </button>
        {quote && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-brand-chrom hover:text-brand-kosc transition"
          >
            Anuluj
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
