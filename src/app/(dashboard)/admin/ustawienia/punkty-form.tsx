"use client";

import { useState, useTransition } from "react";
import { ustawPlatneWyceny, zapiszPunkty } from "./actions";

const input =
  "w-24 bg-brand-grafit border border-brand-border rounded-lg px-3 py-1.5 text-sm text-brand-kosc focus:outline-none focus:border-brand-lime/50";

/** Gate 1: płatne wyceny (punkty). Przełącznik startuje WYŁ. */
export function PunktyForm({
  platneWyceny,
  start,
  pakietPunkty,
  pakietCenaZl,
  migracja,
  p24Status,
}: {
  platneWyceny: boolean;
  start: number;
  pakietPunkty: number | null;
  pakietCenaZl: number | null;
  /** false = brak migracji 033 (tabela punkty_studia) — przełącznik zablokowany. */
  migracja: boolean;
  /** Opis stanu Przelewy24 (klucze, sandbox/produkcja, test dostępu). */
  p24Status: string;
}) {
  const [wlaczone, setWlaczone] = useState(platneWyceny);
  const [pStart, setPStart] = useState(String(start));
  const [pPunkty, setPPunkty] = useState(pakietPunkty != null ? String(pakietPunkty) : "");
  const [pCena, setPCena] = useState(pakietCenaZl != null ? String(pakietCenaZl) : "");
  const [pending, run] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function przelacz(v: boolean) {
    if (v && !confirm("Włączyć płatne wyceny? Od tej chwili każda wycena studia zużywa 1 punkt. Regulamin wymaga ogłoszenia opłat wykonawcom min. 30 dni wcześniej.")) {
      return;
    }
    setMsg(null);
    run(async () => {
      const r = await ustawPlatneWyceny(v);
      if (r.ok) setWlaczone(v);
      setMsg({ ok: r.ok, text: r.ok ? (v ? "Płatne wyceny włączone." : "Płatne wyceny wyłączone.") : r.error });
    });
  }

  function zapisz() {
    setMsg(null);
    run(async () => {
      const r = await zapiszPunkty({
        start: Number(pStart),
        pakietPunkty: pPunkty.trim() === "" ? null : Number(pPunkty),
        pakietCenaZl: pCena.trim() === "" ? null : Number(pCena.replace(",", ".")),
      });
      setMsg({ ok: r.ok, text: r.ok ? "Ustawienia punktów zapisane." : r.error });
    });
  }

  return (
    <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 mb-6">
      <h2 className="font-semibold mb-1">Płatne wyceny (punkty)</h2>
      <p className="text-sm text-brand-chrom mb-4">
        1 punkt = 1 wysłana wycena. Odmowa i przypisanie są darmowe. Każde aktywowane studio dostaje punkty startowe
        automatycznie. Hiline nie płaci.
      </p>

      {!migracja && (
        <p className="text-sm text-amber-300 mb-4">Brak tabel punktów — odpal migrację 033 w SQL Editorze.</p>
      )}

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={wlaczone}
          disabled={pending || !migracja}
          onChange={(e) => przelacz(e.target.checked)}
          className="mt-1"
        />
        <span className="text-sm">
          <strong>Wycena kosztuje 1 punkt</strong>
          <br />
          <span className="text-brand-chrom">
            Wyłączone: studia wyceniają za darmo, saldo tylko widać. Włączone: wycena zużywa punkt, studio bez punktów
            widzi ekran doładowania zamiast formularza, a automat przypisań je pomija.
          </span>
        </span>
      </label>

      <div className="border-t border-brand-border mt-5 pt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="w-44">Punkty startowe</span>
          <input type="number" min={0} max={1000} value={pStart} onChange={(e) => setPStart(e.target.value)} className={input} />
          <span className="text-xs text-brand-chrom">dla nowo aktywowanych studiów</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="w-44">Pakiet: liczba punktów</span>
          <input type="number" min={1} max={1000} value={pPunkty} placeholder="—" onChange={(e) => setPPunkty(e.target.value)} className={input} />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="w-44">Pakiet: cena (zł brutto)</span>
          <input type="text" inputMode="decimal" value={pCena} placeholder="—" onChange={(e) => setPCena(e.target.value)} className={input} />
          <span className="text-xs text-brand-chrom">puste = doładowanie niedostępne</span>
        </div>
        <p className="text-xs text-brand-chrom">Przelewy24: {p24Status}</p>
        <button
          type="button"
          onClick={zapisz}
          disabled={pending}
          className="bg-brand-lime text-brand-grafit font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          Zapisz punkty
        </button>
      </div>

      {msg && <p className={`mt-4 text-sm ${msg.ok ? "text-brand-lime" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}
