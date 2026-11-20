// „Log automatyzacji” (Etap 7, Faza 5) — podgląd tego, co automat zrobił bez klikania w ostatnich
// 7 dniach. Bez akcji: wyjątki i tak czekają wyżej jako karty. Źródło: admin_actions entity='automation'.

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { czyAutoPrzypisanie } from "@/lib/automation/ustawienia";

const OKNO_DNI = 7;

type Wpis = {
  created_at: string;
  action: string;
  entity_id: string | null;
  result: string;
  error: string | null;
  payload: {
    orderId?: string;
    studia?: { nazwa: string; km: number | null }[];
    promienKm?: number | null;
    regula?: string;
  } | null;
};

function kiedy(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" });
}

export default async function LogAutomatyzacji() {
  const admin = createAdminClient();
  const od = new Date(Date.now() - OKNO_DNI * 24 * 60 * 60 * 1000).toISOString();
  const [{ data }, wlaczony] = await Promise.all([
    admin
      .from("admin_actions")
      .select("created_at, action, entity_id, result, error, payload")
      .eq("entity", "automation")
      .gte("created_at", od)
      .order("created_at", { ascending: false })
      .limit(200),
    czyAutoPrzypisanie(admin),
  ]);
  const wpisy = (data ?? []) as Wpis[];

  const udane = wpisy.filter((w) => w.action === "auto_assign" && w.result === "ok");
  const wyjatkiAutomatu = wpisy.filter(
    (w) => (w.action === "auto_assign" || w.action === "auto_lead_to_order") && w.result !== "ok"
  ).length;
  const filtr = wpisy.filter((w) => w.action.startsWith("flag_")).length;

  return (
    <section className="mx-auto max-w-3xl px-4 pb-10">
      <div className="border-t border-neutral-200 pt-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-[#2b2b2b]">Log automatyzacji</h2>
          <span className="text-xs text-neutral-500">ostatnie {OKNO_DNI} dni</span>
        </div>

        {!wlaczony && (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Automatyczne przypisywanie jest wyłączone —{" "}
            <Link href="/admin/ustawienia" className="underline underline-offset-2">
              włącz w Ustawieniach
            </Link>
            .
          </p>
        )}

        <p className="mb-3 text-sm text-neutral-600">
          <strong className="text-[#3f7a12]">{udane.length}</strong> przypisanych automatycznie ·{" "}
          <strong>{wyjatkiAutomatu}</strong> do ręcznej decyzji · <strong>{filtr}</strong> zatrzymanych przez filtr
          (duplikat/spam)
        </p>

        {udane.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Brak automatycznych przypisań w tym okresie.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {udane.map((w, i) => {
              const orderId = w.payload?.orderId || w.entity_id;
              const studia = (w.payload?.studia ?? [])
                .map((s) => `${s.nazwa}${s.km != null ? ` (${s.km} km)` : ""}`)
                .join(", ");
              return (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <time className="w-28 shrink-0 text-xs text-neutral-500" dateTime={w.created_at}>
                    {kiedy(w.created_at)}
                  </time>
                  {orderId ? (
                    <Link href={`/admin/zlecenia/${orderId}`} className="font-medium text-[#2b2b2b] underline-offset-2 hover:underline">
                      Zlecenie {orderId.slice(0, 8)}
                    </Link>
                  ) : (
                    <span className="font-medium">Zlecenie</span>
                  )}
                  <span className="text-neutral-600">→ {studia || "studia"}</span>
                  {w.payload?.promienKm && w.payload.promienKm > 50 ? (
                    <span className="rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-800">promień {w.payload.promienKm} km</span>
                  ) : null}
                  {w.payload?.regula === "wykonawca wskazany przez klienta" && (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">wybór klienta</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
