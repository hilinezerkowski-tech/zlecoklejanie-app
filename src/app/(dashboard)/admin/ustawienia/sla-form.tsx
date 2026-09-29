"use client";

import { useState, useTransition } from "react";
import { ustawAutoPodmiane, zapiszUstawieniaSla } from "./actions";
import type { UstawieniaSla } from "@/lib/sla";

const input =
  "w-20 bg-brand-grafit border border-brand-border rounded-lg px-3 py-1.5 text-sm text-brand-kosc focus:outline-none focus:border-brand-lime/50";

const POLA: { k: keyof UstawieniaSla; label: string; hint: string }[] = [
  { k: "przypomnienie1", label: "Pierwsze przypomnienie po", hint: "godz. roboczych" },
  { k: "przypomnienie2", label: "Ostatnie przypomnienie po", hint: "godz. roboczych" },
  { k: "wygasniecie", label: "Przekazanie zlecenia dalej po", hint: "godz. roboczych" },
  { k: "od", label: "Godziny robocze od", hint: "(pn–sob)" },
  { k: "do", label: "Godziny robocze do", hint: "" },
];

export function SlaForm({ sla, autoPodmiana }: { sla: UstawieniaSla; autoPodmiana: boolean }) {
  const [wartosci, setWartosci] = useState<Record<keyof UstawieniaSla, string>>({
    przypomnienie1: String(sla.przypomnienie1),
    przypomnienie2: String(sla.przypomnienie2),
    wygasniecie: String(sla.wygasniecie),
    od: String(sla.od),
    do: String(sla.do),
  });
  const [auto, setAuto] = useState(autoPodmiana);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function zapisz() {
    setMsg(null);
    start(async () => {
      const r = await zapiszUstawieniaSla({
        przypomnienie1: Number(wartosci.przypomnienie1),
        przypomnienie2: Number(wartosci.przypomnienie2),
        wygasniecie: Number(wartosci.wygasniecie),
        od: Number(wartosci.od),
        do: Number(wartosci.do),
      });
      setMsg({ ok: r.ok, text: r.ok ? r.message : r.error });
    });
  }

  function przelacz(v: boolean) {
    setMsg(null);
    start(async () => {
      const r = await ustawAutoPodmiane(v);
      if (r.ok) setAuto(v);
      setMsg({ ok: r.ok, text: r.ok ? (v ? "Automatyczna podmiana włączona." : "Automatyczna podmiana wyłączona.") : r.error });
    });
  }

  return (
    <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 mb-6">
      <h2 className="font-semibold mb-1">Odpowiedź studia</h2>
      <p className="text-sm text-brand-chrom mb-4">
        Po przypisaniu studio ma czas na wycenę lub odmowę. Bez odpowiedzi dostaje przypomnienia, a na końcu zlecenie
        przechodzi dalej. Przypomnienia idą tylko w godzinach roboczych (strefa Europe/Warsaw).
      </p>

      <div className="space-y-2 mb-4">
        {POLA.map((p) => (
          <label key={p.k} className="flex items-center gap-3 text-sm">
            <span className="w-64 text-brand-chrom">{p.label}</span>
            <input
              type="number"
              min={0}
              value={wartosci[p.k]}
              onChange={(e) => setWartosci({ ...wartosci, [p.k]: e.target.value })}
              className={input}
            />
            <span className="text-xs text-brand-chrom">{p.hint}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={zapisz}
        disabled={pending}
        className="bg-brand-lime text-brand-grafit font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
      >
        Zapisz czasy
      </button>

      <div className="border-t border-brand-border mt-6 pt-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={auto} disabled={pending} onChange={(e) => przelacz(e.target.checked)} className="mt-1" />
          <span className="text-sm">
            <strong>Automatyczna podmiana studia</strong>
            <br />
            <span className="text-brand-chrom">
              Wyłączona: po odmowie albo braku odpowiedzi w Agencie pojawia się karta „Podmień studio” (jedno kliknięcie).
              Włączona: system sam przypisze następne pasujące studio z tego samego miasta (bez wymuszeń), a Ty zobaczysz wpis
              w historii akcji.
            </span>
          </span>
        </label>
      </div>

      {msg && <p className={`mt-4 text-sm ${msg.ok ? "text-brand-lime" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}
