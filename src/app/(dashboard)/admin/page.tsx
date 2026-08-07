import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboard() {
  const supabase = await createClient();

  // Pobierz statystyki
  const { count: ordersCount } = await supabase.from("orders").select("*", { count: "exact", head: true });
  const { count: studiosActive } = await supabase.from("studios").select("*", { count: "exact", head: true }).eq("status", "active");
  const { count: studiosPending } = await supabase.from("studios").select("*", { count: "exact", head: true }).eq("status", "pending");
  const { count: ordersNew } = await supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "new");

  const stats = [
    { label: "Wszystkie zlecenia", value: ordersCount || 0, color: "text-brand-lime" },
    { label: "Nowe (do przypisania)", value: ordersNew || 0, color: "text-amber-400" },
    { label: "Aktywne studia", value: studiosActive || 0, color: "text-teal-400" },
    { label: "Oczekujące weryfikacji", value: studiosPending || 0, color: "text-orange-400" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
            <p className="text-sm text-brand-chrom mb-1">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-8 text-center">
        <p className="text-brand-chrom">
          Metryki na żywo z bazy danych. Zlecenia i studia znajdziesz w menu po lewej.
        </p>
      </div>
    </div>
  );
}
