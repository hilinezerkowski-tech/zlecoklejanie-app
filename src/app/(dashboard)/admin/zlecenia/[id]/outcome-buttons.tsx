"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOrderOutcome } from "./actions";

/** Przyciski "doszło do skutku / nie doszło" z potwierdzeniem. */
export function OutcomeButtons({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function mark(outcome: "completed" | "cancelled") {
    const q =
      outcome === "completed"
        ? "Oznaczyć zlecenie jako zrealizowane? Rozmowy zostaną zamknięte."
        : "Oznaczyć, że zlecenie NIE doszło do skutku? Rozmowy zostaną zamknięte.";
    if (!window.confirm(q)) return;
    setError(null);
    startTransition(async () => {
      const res = await setOrderOutcome(orderId, outcome);
      if (res.ok) router.refresh();
      else setError(res.error || "Błąd zapisu.");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => mark("completed")}
        disabled={pending}
        className="px-3 py-2 rounded-xl text-sm font-medium bg-teal-400/15 text-teal-400 hover:bg-teal-400/25 disabled:opacity-40 transition"
      >
        ✓ Doszło do skutku
      </button>
      <button
        onClick={() => mark("cancelled")}
        disabled={pending}
        className="px-3 py-2 rounded-xl text-sm font-medium bg-red-400/15 text-red-400 hover:bg-red-400/25 disabled:opacity-40 transition"
      >
        ✕ Nie doszło
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
