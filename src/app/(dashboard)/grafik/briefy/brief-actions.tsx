"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondToBrief } from "@/app/actions/designer-briefs";

/** Akceptuj / Odrzuć pod briefem. Widoczne tylko przy briefie bez odpowiedzi. */
export function BriefActions({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"accepted" | "rejected" | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [openNote, setOpenNote] = useState(false);

  async function odpowiedz(decision: "accepted" | "rejected") {
    setLoading(decision);
    setError("");
    const res = await respondToBrief(assignmentId, decision, note);
    setLoading(null);
    if (!res.ok) {
      setError(res.error || "Nieznany błąd.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4 pt-4 border-t border-brand-border">
      <div className="flex gap-2 flex-wrap items-center">
        <button
          onClick={() => odpowiedz("accepted")}
          disabled={loading !== null}
          className="px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50"
        >
          {loading === "accepted" ? "Zapisuję..." : "Biorę ten projekt"}
        </button>
        <button
          onClick={() => odpowiedz("rejected")}
          disabled={loading !== null}
          className="px-5 py-2.5 bg-red-400/15 text-red-400 font-medium text-sm rounded-xl hover:bg-red-400/25 transition disabled:opacity-50"
        >
          {loading === "rejected" ? "Zapisuję..." : "Odrzucam"}
        </button>
        <button
          onClick={() => setOpenNote((v) => !v)}
          className="text-sm text-brand-chrom hover:text-brand-kosc transition"
        >
          {openNote ? "Ukryj komentarz" : "Dodaj komentarz"}
        </button>
      </div>

      {openNote && (
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Np. termin, orientacyjna cena, czego brakuje w briefie."
          className="mt-3 w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition"
        />
      )}

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
