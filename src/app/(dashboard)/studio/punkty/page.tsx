// /studio/punkty — saldo, historia punktów i doładowanie (Gate 1).
// Doładowanie przez Przelewy24 (Faza 2): przycisk aktywny, gdy są klucze P24 i pakiet ustawiony przez admina.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SaldoPunktow } from "@/components/ui/saldo-punktow";
import {
  ETYKIETA_ZRODLA,
  czyPlatneWyceny,
  pobierzUstawieniaPunktow,
  punktyTxt,
  type SaldoStudia,
} from "@/lib/punkty";
import { doladowanieDostepne } from "@/lib/platnosci";
import { DoladujButton } from "@/components/ui/doladuj-button";
import { doladujPunkty } from "./actions";

export const metadata = { title: "Punkty — ZlecOklejanie.pl" };
export const dynamic = "force-dynamic";

type Ruch = { id: string; zmiana: number; saldo_po: number; zrodlo: string; created_at: string };

const kiedy = (iso: string) =>
  new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" });

export default async function PunktyStudia({ searchParams }: { searchParams: { platnosc?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createAdminClient();

  // RLS: studio widzi tylko swoje saldo i ruchy (migracja 033).
  const [{ data: saldoRow }, { data: ruchy }, platne, ustawienia, dostepne, { data: platnosci }] = await Promise.all([
    supabase.from("punkty_studia").select("saldo, zwolnione").eq("studio_id", user!.id).maybeSingle(),
    supabase
      .from("punkty_ruchy")
      .select("id, zmiana, saldo_po, zrodlo, created_at")
      .eq("studio_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(50),
    czyPlatneWyceny(admin),
    pobierzUstawieniaPunktow(admin),
    doladowanieDostepne(admin),
    supabase
      .from("platnosci")
      .select("id, kwota, punkty_kupione, status, created_at")
      .eq("studio_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const saldo: SaldoStudia | null = saldoRow ? { saldo: saldoRow.saldo ?? 0, zwolnione: Boolean(saldoRow.zwolnione) } : null;
  const pakiet =
    ustawienia.pakietPunkty && ustawienia.pakietCenaZl
      ? `${punktyTxt(ustawienia.pakietPunkty)} za ${ustawienia.pakietCenaZl.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} zł brutto`
      : null;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Punkty na wyceny</h1>
      {searchParams.platnosc && (
        <p className="mb-4 rounded-xl border border-brand-lime/30 bg-brand-lime/10 p-4 text-sm">
          Dziękujemy! Punkty dopiszemy, gdy Przelewy24 potwierdzą płatność — zwykle w ciągu minuty. Odśwież stronę.
        </p>
      )}
      <p className="text-brand-chrom mb-6">
        Za każdą wysłaną wycenę płacisz 1 punkt. Odmowa zlecenia i samo otrzymanie zlecenia są bezpłatne.
      </p>

      {!saldo ? (
        <p className="rounded-2xl border border-brand-border bg-brand-grafit-light p-6 text-sm text-brand-chrom">
          Punkty pojawią się po aktywacji konta przez administratora.
        </p>
      ) : saldo.zwolnione ? (
        <p className="rounded-2xl border border-brand-border bg-brand-grafit-light p-6 text-sm text-brand-chrom">
          Twoje konto jest zwolnione z opłat za wyceny.
        </p>
      ) : (
        <SaldoPunktow saldo={saldo} platne={platne} />
      )}

      {saldo && !saldo.zwolnione && (
        <div className="rounded-2xl border border-brand-border bg-brand-grafit-light p-6 mb-6">
          <h2 className="font-semibold mb-2">Doładuj punkty</h2>
          {pakiet ? (
            <p className="text-sm text-brand-chrom mb-4">Pakiet: {pakiet}.</p>
          ) : (
            <p className="text-sm text-brand-chrom mb-4">Cennik pakietów pojawi się wkrótce.</p>
          )}
          {dostepne ? (
            <DoladujButton akcja={doladujPunkty} />
          ) : (
            <button
              type="button"
              disabled
              className="bg-brand-lime/40 text-brand-grafit font-semibold px-4 py-2 rounded-lg text-sm cursor-not-allowed"
            >
              Doładuj przez Przelewy24 — wkrótce
            </button>
          )}
          <p className="mt-3 text-xs text-brand-chrom">Fakturę VAT wystawimy na dane firmy z profilu (NIP i adres).</p>
        </div>
      )}

      {(platnosci ?? []).length > 0 && (
        <>
          <h2 className="font-semibold mb-3">Płatności</h2>
          <ul className="divide-y divide-brand-border rounded-2xl border border-brand-border bg-brand-grafit-light mb-6">
            {((platnosci ?? []) as { id: string; kwota: number; punkty_kupione: number; status: string; created_at: string }[]).map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
                <span className="text-brand-chrom w-32">{kiedy(p.created_at)}</span>
                <span className="flex-1">
                  {punktyTxt(p.punkty_kupione)} · {Number(p.kwota).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} zł
                </span>
                <span
                  className={
                    p.status === "zaplacono" ? "text-brand-lime" : p.status === "blad" ? "text-red-400" : "text-amber-400"
                  }
                >
                  {p.status === "zaplacono" ? "opłacona" : p.status === "blad" ? "nieudana" : "oczekuje"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="font-semibold mb-3">Historia</h2>
      {(ruchy ?? []).length === 0 ? (
        <p className="text-sm text-brand-chrom">Brak ruchów.</p>
      ) : (
        <ul className="divide-y divide-brand-border rounded-2xl border border-brand-border bg-brand-grafit-light">
          {((ruchy ?? []) as Ruch[]).map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
              <span className="text-brand-chrom w-32">{kiedy(r.created_at)}</span>
              <span className="flex-1">{ETYKIETA_ZRODLA[r.zrodlo] ?? r.zrodlo}</span>
              <span className={r.zmiana < 0 ? "text-amber-400" : "text-brand-lime"}>
                {r.zmiana > 0 ? "+" : ""}
                {r.zmiana}
              </span>
              <span className="text-brand-chrom w-24 text-right">saldo {r.saldo_po}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
