"use client";

import { useState, useTransition } from "react";
import { ustawAutoPrzypisanie, zapiszPromienie } from "./actions";

const input =
  "w-20 bg-brand-grafit border border-brand-border rounded-lg px-3 py-1.5 text-sm text-brand-kosc focus:outline-none focus:border-brand-lime/50";

/** Przełączniki i progi automatyzacji zleceń (Etap 7). Przełączniki startują WYŁ. */
export function AutomatForm({ autoPrzypisanie, promienie }: { autoPrzypisanie: boolean; promienie: number[] }) {
  const [wlaczone, setWlaczone] = useState(autoPrzypisanie);
  const [progi, setProgi] = useState<string[]>([0, 1, 2].map((i) => (promienie[i] != null ? String(promienie[i]) : "")));
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

  function zapiszProgi() {
    setMsg(null);
    start(async () => {
      const r = await zapiszPromienie(progi.filter((p) => p.trim() !== "").map(Number));
      setMsg({ ok: r.ok, text: r.ok ? "Promienie zapisane." : r.error });
    });
  }

  const pierwszy = progi.find((p) => p.trim() !== "") || "50";
  const ostatni = [...progi].reverse().find((p) => p.trim() !== "") || pierwszy;

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
            Włączone: zgłoszenie samo zamienia się w zlecenie i trafia do maks. 3 studiów, które robią tę usługę (bez
            pauzy) — najpierw w promieniu {pierwszy} km, a gdy nikogo nie ma, coraz dalej, do {ostatni} km. Przy podobnej
            odległości pierwszeństwo ma studio z mniejszą liczbą zleceń z 7 dni. Nie dotyczy usług „grafika” i „inne” ani
            sytuacji, gdy jedynym kandydatem jest Hiline — wtedy karta w Agencie.
          </span>
        </span>
      </label>

      <div className="border-t border-brand-border mt-5 pt-4">
        <p className="text-sm mb-2">Promienie szukania studiów (km, kolejno)</p>
        <div className="flex items-center gap-2 mb-3">
          {progi.map((p, i) => (
            <input
              key={i}
              type="number"
              min={1}
              max={500}
              value={p}
              placeholder={i === 0 ? "50" : "—"}
              onChange={(e) => setProgi(progi.map((x, j) => (j === i ? e.target.value : x)))}
              className={input}
            />
          ))}
          <span className="text-xs text-brand-chrom">puste pole = brak progu</span>
        </div>
        <button
          type="button"
          onClick={zapiszProgi}
          disabled={pending}
          className="bg-brand-lime text-brand-grafit font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          Zapisz promienie
        </button>
      </div>

      {msg && <p className={`mt-4 text-sm ${msg.ok ? "text-brand-lime" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}
