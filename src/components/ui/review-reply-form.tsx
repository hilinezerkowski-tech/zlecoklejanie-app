"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { replyToReview } from "@/app/actions/reviews";

export function ReviewReplyForm({
  reviewId,
  initial,
}: {
  reviewId: string;
  initial: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-sm font-semibold text-brand-lime hover:underline"
      >
        {initial ? "Edytuj odpowiedź" : "Odpowiedz"}
      </button>
    );
  }

  async function save() {
    setBusy(true);
    setError("");
    const res = await replyToReview(reviewId, value);
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      setError(res.error ?? "Nie udało się zapisać.");
    }
  }

  return (
    <div className="mt-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="Twoja odpowiedź (widoczna publicznie na profilu)…"
        className="w-full rounded-lg border border-brand-border bg-brand-grafit px-3 py-2 text-sm text-brand-kosc outline-none focus:border-brand-lime"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-brand-lime px-4 py-1.5 text-sm font-semibold text-brand-grafit hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Zapisywanie…" : "Zapisz"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 text-sm text-brand-chrom hover:text-brand-kosc"
        >
          Anuluj
        </button>
      </div>
    </div>
  );
}
