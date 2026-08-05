import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function ClientDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Pobierz zlecenia klienta
  const { data: orders } = await supabase
    .from("orders")
    .select("id, service_type, car_brand, car_model, city, status, created_at")
    .eq("client_id", user!.id)
    .order("created_at", { ascending: false });

  const statusLabels: Record<string, { text: string; color: string }> = {
    new: { text: "Nowe", color: "bg-blue-400/15 text-blue-400" },
    assigned: { text: "Szukamy studiów", color: "bg-amber-400/15 text-amber-400" },
    quoted: { text: "Masz oferty!", color: "bg-brand-lime/15 text-brand-lime" },
    chosen: { text: "Wybrano studio", color: "bg-green-400/15 text-green-400" },
    completed: { text: "Zakończone", color: "bg-brand-chrom/15 text-brand-chrom" },
    cancelled: { text: "Anulowane", color: "bg-red-400/15 text-red-400" },
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Moje zlecenia</h1>

      {(!orders || orders.length === 0) ? (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-8 text-center">
          <p className="text-brand-chrom mb-4">Nie masz jeszcze żadnych zleceń.</p>
          <a href="https://zlecoklejanie.pl" className="inline-block px-6 py-3 bg-brand-lime text-brand-grafit font-bold rounded-xl">
            Wyślij zlecenie →
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const status = statusLabels[order.status] || statusLabels.new;
            return (
              <Link key={order.id} href={`/klient/zlecenia/${order.id}`} className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 flex items-center justify-between hover:border-brand-lime/30 transition">
                <div>
                  <p className="font-medium">
                    {order.service_type === "oklejanie" ? "Oklejanie" : order.service_type === "ppf" ? "Folia PPF" : order.service_type}
                    {order.car_brand && ` — ${order.car_brand} ${order.car_model || ""}`}
                  </p>
                  <p className="text-sm text-brand-chrom mt-1">
                    {order.city} · {new Date(order.created_at).toLocaleDateString("pl-PL")}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${status.color}`}>
                  {status.text}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
