import { createClient } from "@/lib/supabase/server";

const serviceLabels: Record<string, string> = {
  oklejanie: "Oklejanie",
  ppf: "Folia PPF",
  branding: "Branding",
  grafika: "Grafika",
  inne: "Inne",
};

// Wynik przypisania z perspektywy studia (stany zakończone).
const outcome: Record<string, { label: string; color: string }> = {
  chosen: { label: "Wygrane 🎉", color: "bg-brand-lime/15 text-brand-lime" },
  rejected: { label: "Klient wybrał inne", color: "bg-red-400/15 text-red-400" },
};

export default async function StudioHistoriaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Przypisania rozstrzygnięte (klient już zdecydował).
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
        created_at
      )
    `
    )
    .eq("studio_id", user!.id)
    .in("status", ["chosen", "rejected"])
    .order("assigned_at", { ascending: false });

  const rows = (assignments || []).filter((a: any) => a.order);
  const wins = rows.filter((a: any) => a.status === "chosen").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Historia</h1>
        <span className="text-sm text-brand-chrom">
          Wygrane: <span className="text-brand-lime font-semibold">{wins}</span>
          {" / "}
          {rows.length} rozstrzygniętych
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-12 text-center">
          <p className="text-brand-chrom mb-2">Brak zakończonych zleceń</p>
          <p className="text-sm text-brand-chrom/60">
            Gdy klient rozstrzygnie zlecenie, w którym brałeś udział, pojawi się
            ono tutaj.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((a: any) => {
            const oc = outcome[a.status] || {
              label: a.status,
              color: "bg-gray-400/15 text-gray-400",
            };
            const car = [a.order.car_brand, a.order.car_model, a.order.car_year]
              .filter(Boolean)
              .join(" ");
            return (
              <div
                key={a.id}
                className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold">
                        {serviceLabels[a.order.service_type] ||
                          a.order.service_type}
                      </h3>
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${oc.color}`}
                      >
                        {oc.label}
                      </span>
                    </div>
                    <p className="text-sm text-brand-chrom">
                      {car || "—"} · {a.order.city}
                    </p>
                  </div>
                  <span className="text-xs text-brand-chrom/60 shrink-0">
                    {a.assigned_at
                      ? new Date(a.assigned_at).toLocaleDateString("pl-PL")
                      : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
