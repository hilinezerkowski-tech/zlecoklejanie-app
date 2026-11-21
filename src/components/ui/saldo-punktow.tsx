// Karta salda punktów studia (Gate 1) — dashboard studia i strona zlecenia.
// Komponent serwerowy. Bez migracji 033 (brak salda) nic nie pokazuje.

import Link from "next/link";
import { punktyTxt, type SaldoStudia } from "@/lib/punkty";

export function SaldoPunktow({ saldo, platne }: { saldo: SaldoStudia | null; platne: boolean }) {
  if (!saldo) return null;
  if (saldo.zwolnione) return null;
  const pusto = platne && saldo.saldo <= 0;
  return (
    <Link
      href="/studio/punkty"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5 mb-6 transition ${
        pusto ? "bg-amber-400/10 border-amber-400/40 hover:border-amber-400" : "bg-brand-grafit-light border-brand-border hover:border-brand-lime/40"
      }`}
    >
      <div>
        <p className="text-sm text-brand-chrom">Twoje punkty na wyceny</p>
        <p className={`text-2xl font-bold ${pusto ? "text-amber-400" : "text-brand-lime"}`}>{punktyTxt(saldo.saldo)}</p>
      </div>
      <p className="text-sm text-brand-chrom max-w-sm">
        {!platne
          ? "Wyceny są teraz bezpłatne — punkty zaczną się liczyć po ogłoszeniu cennika."
          : pusto
          ? "Nie masz punktów — doładuj, żeby wyceniać nowe zlecenia."
          : "1 wysłana wycena = 1 punkt. Odmowa jest darmowa."}
      </p>
    </Link>
  );
}
