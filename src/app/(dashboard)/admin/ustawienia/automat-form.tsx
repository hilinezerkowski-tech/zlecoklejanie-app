"use client";

import { useState, useTransition } from "react";
import { ustawAutoPrzypisanie } from "./actions";

/** Przełączniki automatyzacji zleceń (Etap 7). Wszystkie startują WYŁ. */
export function AutomatForm({ autoPrzypisanie, promienKm }: { autoPrzypisanie: boolean; promienKm: number }) {
  const [wlaczone, setWlaczone] = useState(autoPrzypisanie);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function przelacz(v: boolean) {
    setMsg(null);
    start(async () => {
      const r = await ustawAutoPrzypisanie(v);
      if (r.ok) setWlaczone(v);
      setMsg({
        ok: r.ok,
        text: r.ok ? (v ? "Automatyczne przypisywanie włączone." : "Automatyczne przypisywanie wyłączone.") : r.error,
      });
    });
  }

  return (
    <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 mb-6">
      <h2 className="font-semibold mb-1">Automatyzacja zleceń</h2>
      <p className="text-sm text-brand-chrom mb-4">
        Zgłoszenia oznaczone przez filtr jako możliwy duplikat albo spam nigdy nie idą automatycznie — zawsze trafiają
        do Agenta.
      </p>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={wlaczone}
          disabled={pending}
          onChange={(e) => przelacz(e.target.checked)}
          className="mt-1"
        />
        <span className="text-sm">
          <strong>Automatyczne przypisywanie zleceń</strong>
          <br />
          <span className="text-brand-chrom">
            Wyłączone: zgłoszenie klienta czeka w skrzynce leadów, zamieniasz je na zlecenie i przypisujesz studia ręcznie.
            Włączone: zgłoszenie samo zamienia się w zlecenie i trafia do maks. 3 najbliższych studiów, które robią tę
            usługę (do {promienKm} km, bez pauzy). Nie dotyczy usług „grafika” i „inne” ani sytuacji, gdy jedynym
            kandydatem jest Hiline — wtedy karta w Agencie. Każde przypisanie widać w historii akcji.
          </span>
        </span>
      </label>

      {msg && <p className={`mt-4 text-sm ${msg.ok ? "text-brand-lime" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}
