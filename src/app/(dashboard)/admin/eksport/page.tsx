import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");
}

async function getCounts() {
  const admin = createAdminClient();
  const [ordersRes, studiosRes, leadRes] = await Promise.all([
    admin.from("orders").select("id", { count: "exact", head: true }),
    admin.from("studios").select("id", { count: "exact", head: true }),
    admin.from("landing_leads").select("id", { count: "exact", head: true }),
  ]);
  return {
    orders: ordersRes.count ?? 0,
    studios: studiosRes.count ?? 0,
    leads: leadRes.count ?? 0,
  };
}

export default async function EksportPage() {
  await requireAdmin();
  const counts = await getCounts();

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-brand-text mb-2">Eksport danych</h1>
      <p className="text-gray-400 mb-8 text-sm">
        Pliki CSV z BOM (UTF-8) — otwieraj w Excelu lub Google Sheets.
      </p>

      <div className="space-y-4">
        <div className="bg-brand-card border border-white/10 rounded-xl p-5 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-brand-text">Zlecenia</div>
            <div className="text-sm text-gray-400">{counts.orders} rekordów — id, usługa, miasto, auto, status, dane klienta</div>
          </div>
          <a
            href="/api/admin/export/orders"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-brand-lime text-black text-sm font-semibold rounded-lg hover:bg-brand-lime/90 transition-colors"
          >
            ⬇ Pobierz CSV
          </a>
        </div>

        <div className="bg-brand-card border border-white/10 rounded-xl p-5 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-brand-text">Studia</div>
            <div className="text-sm text-gray-400">{counts.studios} rekordów — nazwa, NIP, status, adres, ocena Google, kontakt</div>
          </div>
          <a
            href="/api/admin/export/studios"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-brand-lime text-black text-sm font-semibold rounded-lg hover:bg-brand-lime/90 transition-colors"
          >
            ⬇ Pobierz CSV
          </a>
        </div>

        <div className="bg-brand-card border border-white/10 rounded-xl p-5 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-brand-text">Leady z landing page</div>
            <div className="text-sm text-gray-400">{counts.leads} rekordów — eksport przez panel Leady (filtr + ręczny download)</div>
          </div>
          <Link
            href="/admin/leady"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 border border-white/20 text-brand-text text-sm font-semibold rounded-lg hover:bg-white/5 transition-colors"
          >
            → Panel Leady
          </Link>
        </div>
      </div>

      <div className="mt-8 text-xs text-gray-500">
        <p>Dane eksportowane są w czasie rzeczywistym z bazy Supabase.</p>
        <p className="mt-1">Pliki zawierają wszystkie rekordy bez paginacji — przy dużej bazie może chwilę potrwać.</p>
      </div>
    </div>
  );
}
