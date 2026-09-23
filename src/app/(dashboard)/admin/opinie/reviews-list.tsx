"use client";
import { useState, useTransition } from "react";
import { setReviewStatus, deleteReview } from "./actions";

type Review = {
  id: string;
  created_at: string;
  author_name: string | null;
  rating: number;
  comment: string | null;
  status: string;
  studio: { business_name: string | null; slug: string | null } | null;
};

function Stars({ n }: { n: number }) {
  return (
    <span className="text-brand-lime">
      {"★".repeat(n)}
      <span className="text-brand-border">{"★".repeat(5 - n)}</span>
    </span>
  );
}

function ReviewCard({ r }: { r: Review }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  const studioName = r.studio?.business_name ?? "—";

  function act(fn: () => Promise<{ ok: boolean }>) {
    start(async () => {
      const res = await fn();
      if (res.ok) setGone(true);
    });
  }

  return (
    <div className="rounded-2xl border border-brand-border bg-brand-grafit-light p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{r.author_name}</span>
          <Stars n={r.rating} />
        </div>
        <span className="text-xs text-brand-chrom">
          {studioName}
          {r.studio?.slug ? ` · /wykonawca/${r.studio.slug}` : ""}
        </span>
      </div>
      {r.comment && (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{r.comment}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-brand-chrom">
          {new Date(r.created_at).toLocaleDateString("pl-PL")} · status: {r.status}
        </span>
        <div className="ml-auto flex gap-2">
          {r.status !== "published" && (
            <button
              disabled={pending}
              onClick={() => act(() => setReviewStatus(r.id, "published"))}
              className="rounded-lg bg-brand-lime px-3 py-1.5 text-xs font-semibold text-brand-grafit hover:opacity-90 disabled:opacity-50"
            >
              Publikuj
            </button>
          )}
          {r.status !== "rejected" && (
            <button
              disabled={pending}
              onClick={() => act(() => setReviewStatus(r.id, "rejected"))}
              className="rounded-lg border border-brand-border px-3 py-1.5 text-xs text-brand-kosc hover:border-amber-400 hover:text-amber-400 disabled:opacity-50"
            >
              Odrzuć
            </button>
          )}
          <button
            disabled={pending}
            onClick={() => {
              if (confirm("Usunąć opinię na stałe?")) act(() => deleteReview(r.id));
            }}
            className="rounded-lg border border-brand-border px-3 py-1.5 text-xs text-brand-chrom hover:border-red-400 hover:text-red-400 disabled:opacity-50"
          >
            Usuń
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReviewsList({
  pending,
  others,
}: {
  pending: Review[];
  others: Review[];
}) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-chrom">
          Do moderacji ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-brand-chrom">Brak opinii oczekujących.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <ReviewCard key={r.id} r={r} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-chrom">
          Pozostałe ({others.length})
        </h2>
        {others.length === 0 ? (
          <p className="text-sm text-brand-chrom">Brak.</p>
        ) : (
          <div className="space-y-3">
            {others.map((r) => (
              <ReviewCard key={r.id} r={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
