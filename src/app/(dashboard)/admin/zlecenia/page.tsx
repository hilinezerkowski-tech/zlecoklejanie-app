import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { SearchList } from "@/components/ui/search-list";

const statusLabels: Record<string, { label: string; color: string }> = {
  new: { label: "Nowe", color: "bg-amber-400/15 text-amber-400" },
  assigned: { label: "Przypisane", color: "bg-blue-400/15 text-blue-400" },
  quoted: { label: "Wycenione", color: "bg-purple-400/15 text-purple-400" },
  chosen: { label: "Wybrane", color: "bg-brand-lime/15 text-brand-lime" },
  completed: { label: "Zakończone", color: "bg-teal-400/15 text-teal-400" },
  cancelled: { label: "Anulowane", color: "bg-red-400/15 text-red-400" },
};

const serviceLabels: Record<string, string> = {
  oklejanie: "Oklejanie",
  ppf: "PPF",
  branding: "Branding",
  grafika: "Grafika",
  inne: "Inne",
};

export default async function ZleceniaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(`
      id,
      service_type,
      car_brand,
      car_model,
      city,
      status,
      needs_designer,
      created_at,
      client:profiles!orders_client_id_fkey(email, full_name)
    `)
    .order("created_at", { ascending: false });

  if (params.status) {
    query = query.eq("status", params.status);
  }

  const { data: orders, error } = await query;

  // Podsumowanie rozmów per zlecenie: liczba wiadomości + kto czeka na odpowiedź
  const orderIds = (orders || []).map((o: any) => o.id);
  const chat: Record<string, { count: number; lastRole: string; lastAt: string }> = {};
  if (orderIds.length > 0) {
    const { data: msgs } = await supabase
      .from("order_messages")
      .select("order_id, sender_role, created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true });
    for (const m of msgs || []) {
      const c = chat[m.order_id] || { count: 0, lastRole: "", lastAt: "" };
      c.count += 1;
      c.lastRole = m.sender_role;
      c.lastAt = m.created_at;
      chat[m.order_id] = c;
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Zlecenia</h1>
        <span className="text-sm text-brand-chrom">
          {orders?.length || 0} zleceń
        </span>
      </div>

      {/* Filtry statusów */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Link
          href="/admin/zlecenia"
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            !params.status
              ? "bg-brand-lime/15 text-brand-lime"
              : "text-brand-chrom hover:text-brand-kosc hover:bg-white/5"
          }`}
        >
          Wszystkie
        </Link>
        {Object.entries(statusLabels).map(([key, { label }]) => (
          <Link
            key={key}
            href={`/admin/zlecenia?status=${key}`}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              params.status === key
                ? "bg-brand-lime/15 text-brand-lime"
                : "text-brand-chrom hover:text-brand-kosc hover:bg-white/5"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Lista zleceń */}
      {!orders || orders.length === 0 ? (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-12 text-center">
          <p className="text-brand-chrom mb-2">Brak zleceń</p>
          <p className="text-sm text-brand-chrom/60">
            Zlecenia pojawią się tutaj, gdy klienci zaczną wysyłać zapytania
            przez formularz na stronie.
          </p>
        </div>
      ) : (
        <SearchList
          placeholder="Szukaj zlecenia — auto, miasto, klient, usługa..."
          emptyText="Żadne zlecenie nie pasuje do wyszukiwania."
          head={
            <thead>
              <tr className="border-b border-brand-border text-left text-sm text-brand-chrom">
                <th className="px-6 py-4 font-medium">Usługa</th>
                <th className="px-6 py-4 font-medium">Pojazd</th>
                <th className="px-6 py-4 font-medium">Miasto</th>
                <th className="px-6 py-4 font-medium">Klient</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Rozmowa</th>
                <th className="px-6 py-4 font-medium">Data</th>
                <th className="px-6 py-4 font-medium"></th>
              </tr>
            </thead>
          }
          rows={orders.map((order: any) => {
                const st = statusLabels[order.status] || {
                  label: order.status,
                  color: "bg-gray-400/15 text-gray-400",
                };
                const node = (
                  <tr
                    key={order.id}
                    className="border-b border-brand-border/50 hover:bg-white/[0.02] transition"
                  >
                    <td className="px-6 py-4 text-sm">
                      <span className="flex items-center gap-2">
                        {serviceLabels[order.service_type] || order.service_type}
                        {order.needs_designer && (
                          <span
                            title="Klient chce, żebyśmy dobrali grafika"
                            className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-400/15 text-purple-400 whitespace-nowrap"
                          >
                            🎨 grafik
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {order.car_brand} {order.car_model}
                    </td>
                    <td className="px-6 py-4 text-sm">{order.city}</td>
                    <td className="px-6 py-4 text-sm text-brand-chrom">
                      {order.client?.full_name || order.client?.email || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-brand-chrom whitespace-nowrap">
                      {chat[order.id] ? (
                        <>
                          💬 {chat[order.id].count}
                          {!["completed", "cancelled"].includes(order.status) && (
                            <span className="block text-brand-chrom/60">
                              czeka:{" "}
                              {chat[order.id].lastRole === "client" ? "studio" : "klient"}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-brand-chrom">
                      {new Date(order.created_at).toLocaleDateString("pl-PL")}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/admin/zlecenia/${order.id}`}
                        className="text-sm text-brand-lime hover:underline"
                      >
                        Szczegóły →
                      </Link>
                    </td>
                  </tr>
                );
                return {
                  key: order.id,
                  text: [
                    serviceLabels[order.service_type] || order.service_type,
                    order.car_brand,
                    order.car_model,
                    order.city,
                    order.client?.full_name,
                    order.client?.email,
                    st.label,
                    order.needs_designer ? "grafik dobór grafika" : null,
                  ]
                    .filter(Boolean)
                    .join(" "),
                  node,
                };
              })}
        />
      )}
    </div>
  );
}
