"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOrderStatus, undoOrderOutcome } from "./actions";

/*
 * Faza A4 — sterowanie statusem zlecenia przez admina:
 *  - "Cofnij wynik" gdy zlecenie jest completed/cancelled,
 *  - ręczny wybór dowolnego statusu (pełna kontrola).
 */

const STATUSES: [string, string][] = [
  ["new", "Nowe"],
  ["assigned", "Przypisane"],
  ["quoted", "Wycenione"],
  ["chosen", "Wybrane"],
  ["completed", "Zakończone"],
  ["cancelled", "Anulowane"],
];

export function OrderStatusControl({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState(status);

  const hasOutcome = ["completed", "cancelled"].includes(status);

  function undo() {
    setError(null);
    startTransition(async () => {
      const res = await undoOrderOutcome(orderId);
      if (res.ok) router.refresh();
      else setError(res.error || "Nie udało się cofnąć.");
    });
  }

  function apply() {
    if (choice === status) return;
    const label = STATUSES.find(([v]) => v === choice)?.[1] || choice;
    if (!window.confirm(`Zmienić status zlecenia na „${label}”?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await setOrderStatus(orderId, choice);
      if (res.ok) router.refresh();
      else setError(res.error || "Nie udało się zmienić statusu.");
    });
  }

  return (
    <div className="mt-4 pt-4 border-t border-brand-border">
      {hasOutcome && (
        <button
          type="button"
          onClick={undo}
          disabled={pending}
          className="mb-3 px-3 py-2 rounded-xl text-sm font-medium bg-amber-400/15 text-amber-400 hover:bg-amber-400/25 disabled:opacity-40 transition"
        >
          ↩ Cofnij wynik
        </button>
      )}

      <p className="text-xs text-brand-chrom mb-1">Zmień status ręcznie</p>
      <div className="flex gap-2">
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          disabled={pending}
          className="flex-1 px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc focus:outline-none focus:border-brand-lime transition"
        >
          {STATUSES.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={apply}
          disabled={pending || choice === status}
          className="px-4 py-2 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-40"
        >
          {pending ? "..." : "Ustaw"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
