"use client";

// Przycisk „Doładuj przez Przelewy24” — woła akcję serwera, która zakłada płatność, i przekierowuje do P24.
import { useState, useTransition } from "react";
import type { WynikPlatnosci } from "@/lib/platnosci";

export function DoladujButton({
  akcja,
  etykieta = "Doładuj przez Przelewy24",
  className = "bg-brand-lime text-brand-grafit font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50",
}: {
  akcja: () => Promise<WynikPlatnosci>;
  etykieta?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [blad, setBlad] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() => {
          setBlad(null);
          start(async () => {
            const r = await akcja();
            if (r.ok) window.location.href = r.link;
            else setBlad(r.error);
          });
        }}
      >
        {pending ? "Łączę z Przelewy24…" : etykieta}
      </button>
      {blad && <p className="mt-2 text-sm text-red-400">{blad}</p>}
    </div>
  );
}
