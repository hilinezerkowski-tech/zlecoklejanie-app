import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

// Etykiety usług i zakresu — spójne z panelem admina
const serviceLabels: Record<string, string> = {
  oklejanie: "Oklejanie",
  ppf: "Folia PPF",
  branding: "Branding",
  grafika: "Grafika",
  inne: "Inne",
};

// Status przypisania widziany oczami studia
const assignmentStatus: Record<string, { label: string; color: string }> = {
  pending: { label: "Do wyceny", color: "bg-amber-400/15 text-amber-400" },
  quoted: { label: "Wyceniono", color: "bg-purple-400/15 text-purple-400" },
  chosen: { label: "Wybrano Ciebie 🎉", color: "bg-brand-lime/15 text-brand-lime" },
  rejected: { label: "Klient wybrał inne", color: "bg-red-400/15 text-red-400" },
};

export default async function StudioOrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Aktywne przypisania do tego studia (bez zakończonych/anulowanych)
  // studios.id === profile.id === auth uid dla konta studia
  const { data: assignments } = await supabase
    .from("order_assignments")
    .select(
      `
      id,
      status,
      assigned_at,
      order:orders(
        id,
        service_type,
        car_brand,
        car_model,
        car_year,
        city,
        scope,
        status,
        created_at
      )
    `
    )
    .eq("studio_id", user!.id)
    .order("assigned_at", { ascending: false });

  // Odfiltruj przypisania bez zlecenia (np. usunięte) i te już zakończone
  const active = (assignments || []).filter(
    (a: any) =>
      a.order &&
      a.order.status !== "completed" &&
      a.order.status !== "cancelled"
  );

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Zlecenia dla Ciebie</h1>
      <p className="text-brand-chrom mb-8">
        Zapytania przypisane do Twojego studia. Wyślij wycenę, żeby klient mógł
        Cię wybrać.
      </p>

      {active.length === 0 ? (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-8 text-center">
          <p className="text-brand-chrom">
            Nie masz obecnie żadnych zleceń do wyceny.
            <br />
            Nowe zapytania pojawią się tutaj, gdy klient z Twojej okolicy wyśle
            zgłoszenie.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((a: any) => {
            const order = a.order;
            const st = assignmentStatus[a.status] || assignmentStatus.pending;
            return (
              <Link
                key={a.id}
                href={`/studio/zlecenia/${order.id}`}
                className="block bg-brand-grafit-light border border-brand-border rounded-2xl p-6 hover:border-brand-lime/40 transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {serviceLabels[order.service_type] || order.service_type}
                      {order.car_brand &&
                        ` — ${order.car_brand} ${order.car_model || ""}`}
                    </p>
                    <p className="text-sm text-brand-chrom mt-1">
                      {order.city} ·{" "}
                      {new Date(order.created_at).toLocaleDateString("pl-PL")}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${st.color}`}
                  >
                    {st.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
