import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AssignStudioForm } from "./assign-form";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Pobierz zlecenie z klientem
  const { data: order } = await supabase
    .from("orders")
    .select(`
      *,
      client:profiles!orders_client_id_fkey(email, full_name, phone)
    `)
    .eq("id", id)
    .single();

  if (!order) notFound();

  // Pobierz przypisania z danymi studiów
  const { data: assignments } = await supabase
    .from("order_assignments")
    .select(`
      id,
      status,
      assigned_at,
      studio:studios!order_assignments_studio_id_fkey(
        id,
        business_name,
        address,
        instagram
      )
    `)
    .eq("order_id", id)
    .order("assigned_at", { ascending: true });

  // Pobierz wyceny
  const { data: quotes } = await supabase
    .from("quotes")
    .select(`
      *,
      studio:studios!quotes_studio_id_fkey(business_name)
    `)
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  // Pobierz dostępne studia do przypisania
  const { data: availableStudios } = await supabase
    .from("studios")
    .select("id, business_name, address, specializations")
    .eq("status", "active");

  const assignedStudioIds = (assignments || []).map(
    (a: any) => a.studio?.id
  );

  const unassignedStudios = (availableStudios || []).filter(
    (s: any) => !assignedStudioIds.includes(s.id)
  );

  const serviceLabels: Record<string, string> = {
    oklejanie: "Oklejanie",
    ppf: "PPF",
    branding: "Branding",
    grafika: "Grafika",
    inne: "Inne",
  };

  const scopeLabels: Record<string, string> = {
    full: "Całe auto",
    full_wneki: "Całe auto + wnęki",
    partial: "Częściowe",
    front: "Przód (maska, zderzak)",
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    new: { label: "Nowe", color: "bg-amber-400/15 text-amber-400" },
    assigned: { label: "Przypisane", color: "bg-blue-400/15 text-blue-400" },
    quoted: { label: "Wycenione", color: "bg-purple-400/15 text-purple-400" },
    chosen: { label: "Wybrane", color: "bg-brand-lime/15 text-brand-lime" },
    completed: { label: "Zakończone", color: "bg-teal-400/15 text-teal-400" },
    cancelled: { label: "Anulowane", color: "bg-red-400/15 text-red-400" },
  };

  const st = statusLabels[order.status] || {
    label: order.status,
    color: "bg-gray-400/15 text-gray-400",
  };

  return (
    <div className="max-w-4xl">
      {/* Nagłówek */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <a
            href="/admin/zlecenia"
            className="text-sm text-brand-chrom hover:text-brand-kosc transition mb-2 inline-block"
          >
            ← Zlecenia
          </a>
          <h1 className="text-2xl font-bold">
            {serviceLabels[order.service_type] || order.service_type}
            {order.car_brand && ` — ${order.car_brand} ${order.car_model || ""}`}
          </h1>
        </div>
        <span className={`text-sm px-3 py-1 rounded-full font-medium ${st.color}`}>
          {st.label}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dane zlecenia */}
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
          <h2 className="font-semibold mb-4">Dane zlecenia</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-brand-chrom">Usługa</dt>
              <dd>{serviceLabels[order.service_type]}</dd>
            </div>
            {order.scope && (
              <div className="flex justify-between">
                <dt className="text-brand-chrom">Zakres</dt>
                <dd>{scopeLabels[order.scope] || order.scope}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-brand-chrom">Miasto</dt>
              <dd>{order.city}</dd>
            </div>
            {order.car_brand && (
              <div className="flex justify-between">
                <dt className="text-brand-chrom">Pojazd</dt>
                <dd>
                  {order.car_brand} {order.car_model}{" "}
                  {order.car_year && `(${order.car_year})`}
                </dd>
              </div>
            )}
            {order.estimated_min && (
              <div className="flex justify-between">
                <dt className="text-brand-chrom">Szacunek klienta</dt>
                <dd>
                  {order.estimated_min}
                  {order.estimated_max && `–${order.estimated_max}`} zł
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-brand-chrom">Data zgłoszenia</dt>
              <dd>
                {new Date(order.created_at).toLocaleDateString("pl-PL", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </dd>
            </div>
          </dl>
          {order.description && (
            <div className="mt-4 pt-4 border-t border-brand-border">
              <p className="text-sm text-brand-chrom mb-1">Opis</p>
              <p className="text-sm">{order.description}</p>
            </div>
          )}
        </div>

        {/* Dane klienta */}
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
          <h2 className="font-semibold mb-4">Klient</h2>
          <dl className="space-y-3 text-sm">
            {order.client?.full_name && (
              <div className="flex justify-between">
                <dt className="text-brand-chrom">Imię</dt>
                <dd>{order.client.full_name}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-brand-chrom">Email</dt>
              <dd>{order.client?.email || "—"}</dd>
            </div>
            {order.client?.phone && (
              <div className="flex justify-between">
                <dt className="text-brand-chrom">Telefon</dt>
                <dd>{order.client.phone}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Przypisane studia */}
      <div className="mt-6 bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">
            Przypisane studia ({assignments?.length || 0}/3)
          </h2>
        </div>

        {assignments && assignments.length > 0 ? (
          <div className="space-y-3">
            {assignments.map((a: any) => (
              <div
                key={a.id}
                className="flex items-center justify-between p-4 bg-brand-grafit border border-brand-border rounded-xl"
              >
                <div>
                  <p className="font-medium text-sm">
                    {a.studio?.business_name || "Studio"}
                  </p>
                  <p className="text-xs text-brand-chrom">
                    {a.studio?.address || ""}
                    {a.studio?.instagram && ` · @${a.studio.instagram}`}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full font-medium ${
                    a.status === "quoted"
                      ? "bg-purple-400/15 text-purple-400"
                      : a.status === "chosen"
                      ? "bg-brand-lime/15 text-brand-lime"
                      : a.status === "rejected"
                      ? "bg-red-400/15 text-red-400"
                      : "bg-amber-400/15 text-amber-400"
                  }`}
                >
                  {a.status === "pending"
                    ? "Oczekuje"
                    : a.status === "quoted"
                    ? "Wyceniono"
                    : a.status === "chosen"
                    ? "Wybrany"
                    : a.status === "rejected"
                    ? "Odrzucony"
                    : a.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-brand-chrom">
            Żadne studio nie zostało jeszcze przypisane.
          </p>
        )}

        {/* Formularz przypisania */}
        {(assignments?.length || 0) < 3 && unassignedStudios.length > 0 && (
          <AssignStudioForm
            orderId={order.id}
            studios={unassignedStudios}
          />
        )}

        {unassignedStudios.length === 0 && (assignments?.length || 0) < 3 && (
          <p className="mt-4 text-sm text-brand-chrom/60">
            Brak aktywnych studiów do przypisania.{" "}
            <a href="/admin/studia" className="text-brand-lime hover:underline">
              Dodaj studio →
            </a>
          </p>
        )}
      </div>

      {/* Wyceny */}
      {quotes && quotes.length > 0 && (
        <div className="mt-6 bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
          <h2 className="font-semibold mb-4">Wyceny</h2>
          <div className="space-y-3">
            {quotes.map((q: any) => (
              <div
                key={q.id}
                className="p-4 bg-brand-grafit border border-brand-border rounded-xl"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-sm">
                    {q.studio?.business_name}
                  </p>
                  <p className="text-brand-lime font-bold">
                    {q.price_min}
                    {q.price_max && `–${q.price_max}`} zł
                  </p>
                </div>
                {q.comment && (
                  <p className="text-sm text-brand-chrom">{q.comment}</p>
                )}
                {q.estimated_days && (
                  <p className="text-xs text-brand-chrom/60 mt-1">
                    Szacowany czas: {q.estimated_days} dni
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
