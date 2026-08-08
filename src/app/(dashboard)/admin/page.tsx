import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const supabase = await createClient();

  // Statystyki z RLS (widoczne dla admina)
  const { count: ordersCount } = await supabase.from("orders").select("*", { count: "exact", head: true });
  const { count: studiosActive } = await supabase.from("studios").select("*", { count: "exact", head: true }).eq("status", "active");
  const { count: studiosPending } = await supabase.from("studios").select("*", { count: "exact", head: true }).eq("status", "pending");
  const { count: ordersNew } = await supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "new");

  // Leady z landing page: tabela celowo bez polityki SELECT, więc liczymy
  // kluczem service role. Rola admina jest już wymuszona przez layout + middleware.
  let leadsNew = 0;
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("landing_leads")
      .select("*", { count: "exact", head: true })
      .eq("status", "new");
    leadsNew = count || 0;
  } catch {
    // Brak tabeli/migracji — kafelek pokaże 0 zamiast wywalać dashboard.
    leadsNew = 0;
  }

  const stats = [
    { label: "Nowe leady", value: leadsNew, color: "text-brand-lime", href: "/admin/leady?status=new" },
    { label: "Nowe zlecenia (do przypisania)", value: ordersNew || 0, color: "text-amber-400", href: "/admin/zlecenia?status=new" },
    { label: "Wszystkie zlecenia", value: ordersCount || 0, color: "text-teal-400", href: "/admin/zlecenia" },
    { label: "Aktywne studia", value: studiosActive || 0, color: "text-blue-400", href: "/admin/studia" },
    { label: "Studia do weryfikacji", value: studiosPending || 0, color: "text-orange-400", href: "/admin/studia" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Dashboard</h1>

      {/* Kafelki metryk — klikalne, prowadzą do przefiltrowanej listy */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 hover:border-brand-lime/40 transition"
          >
            <p className="text-sm text-brand-chrom mb-1">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
          </Link>
        ))}
      </div>

      <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-8">
        <h2 className="font-semibold mb-3">Obieg zlecenia</h2>
        <ol className="text-sm text-brand-chrom space-y-1 list-decimal list-inside">
          <li>Klient wysyła formularz na zlecoklejanie.pl → trafia do <strong className="text-brand-kosc">Leadów</strong>.</li>
          <li>Klikasz „Utwórz zlecenie” → powstaje konto klienta i zlecenie.</li>
          <li>Przypisujesz maksymalnie 3 studia → dostają e-mail z zapytaniem.</li>
          <li>Studia wysyłają wyceny → klient dostaje e-mail i wybiera ofertę.</li>
          <li>Obie strony dostają kontakt do siebie.</li>
        </ol>
      </div>
    </div>
  );
}
