"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Formularz opinii na publicznym profilu. Insert jako 'pending' (RLS wymusza),
// admin publikuje w panelu. Bez konta — klient podaje imie i ocene.
export function ReviewForm({ studioId }: { studioId: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1 || !name.trim()) return;
    setState("sending");
    try {
      const supabase = createClient();
      const { error } = await supabase.from("reviews").insert({
        studio_id: studioId,
        author_name: name.trim().slice(0, 80),
        rating,
        comment: comment.trim().slice(0, 1000) || null,
        status: "pending",
      });
      if (error) throw error;
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="mt-6 rounded-2xl border border-brand-border bg-brand-grafit-light p-6">
        <p className="text-brand-lime font-semibold">Dziękujemy za opinię!</p>
        <p className="mt-1 text-sm text-brand-chrom">
          Sprawdzimy ją i wkrótce pojawi się na profilu.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 rounded-lg border border-brand-border px-4 py-2 text-sm font-semibold text-brand-kosc hover:border-brand-lime hover:text-brand-lime"
      >
        Dodaj opinię
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-6 rounded-2xl border border-brand-border bg-brand-grafit-light p-6 space-y-4"
    >
      <h3 className="text-lg font-semibold">Twoja opinia</h3>

      <div>
        <span className="mb-1 block text-sm text-brand-chrom">Ocena *</span>
        <div className="flex gap-1 text-2xl">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className={
                (hover || rating) >= n ? "text-brand-lime" : "text-brand-border"
              }
              aria-label={`${n} z 5`}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="rv-name" className="mb-1 block text-sm text-brand-chrom">
          Imię lub podpis *
        </label>
        <input
          id="rv-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          className="w-full rounded-lg border border-brand-border bg-brand-grafit px-3 py-2 text-brand-kosc outline-none focus:border-brand-lime"
        />
      </div>

      <div>
        <label htmlFor="rv-comment" className="mb-1 block text-sm text-brand-chrom">
          Komentarz
        </label>
        <textarea
          id="rv-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          rows={4}
          className="w-full rounded-lg border border-brand-border bg-brand-grafit px-3 py-2 text-brand-kosc outline-none focus:border-brand-lime"
        />
      </div>

      {state === "error" && (
        <p className="text-sm text-red-400">
          Nie udało się zapisać opinii. Spróbuj ponownie.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={state === "sending" || rating < 1 || !name.trim()}
          className="rounded-lg bg-brand-lime px-5 py-2 text-sm font-semibold text-brand-grafit hover:opacity-90 disabled:opacity-50"
        >
          {state === "sending" ? "Wysyłanie…" : "Wyślij opinię"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm text-brand-chrom hover:text-brand-kosc"
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}
