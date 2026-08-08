import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChooseQuoteButton } from "./choose-quote-button";

// Etykiety spojne z pozostalymi panelami
const serviceLabels: Record<string, string> = {
  oklejanie: "Oklejanie",
  ppf: "Folia PPF",
  branding: "Branding",
  grafika: "Grafika",
  inne: "Inne",
};

const scopeLabels: Record<string, string> = {
  full: "Całe auto",
  full_wneki: "Całe auto + wnęki",
  partial: "Wybrane elementy",
  front: "Front (maska, zderzak, lusterka)",
};

const statusLabels: Record<string, { text: string; color: string }> = {
  new: { text: "Nowe", color: "bg-blue-400/15 text-blue-400" },
  assigned: { text: "Szukamy studiów", color: "bg-amber-400/15 text-amber-400" },
  quoted: { text: "Masz oferty!", color: "bg-brand-lime/15 text-brand-lime" },
  chosen: { text: "Wybrano studio", color: "bg-green-400/15 text-green-400" },
  completed: { text: "Zakończone", color: "bg-brand-chrom/15 text-brand-chrom" },
  cancelled: { text: "Anulowane", color: "bg-red-400/15 text-red-400" },
};

export default async function ClientOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();

  // RLS: klient widzi tylko wlasne zlecenia — brak wiersza => notFound
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, service_type, car_brand, car_model, car_year, scope, city, description, photos, status, chosen_quote_id, created_at"
    )
    .eq("id", params.id)
    .single();

  if (!order) notFound();

  // Oferty na tym zleceniu (RLS: klient widzi wyceny wlasnych zlecen)
  const { data: quotes } = await supabase
    .from("quotes")
    .select(
      "id, studio_id, price_min, price_max, comment, estimated_days, status, created_at"
    )
    .eq("order_id", params.id)
    .order("price_min", { ascending: true });

  // Nazwy studiow (RLS: publicznie widoczne aktywne studia)
  const studioIds = Array.from(
    new Set((quotes ?? []).map((q) => q.studio_id))
  );
  const studioMap: Record<
    string,
    { business_name: string; city: string | null; slug: string | null }
  > = {};
  if (studioIds.length > 0) {
    const { data: studios } = await supabase
      .from("studios")
      .select("id, business_name, city, slug")
      .in("id", studioIds);
    for (const s of studios ?? []) {
      studioMap[s.id] = {
        business_name: s.business_name,
        city: s.city,
        slug: s.slug,
      };
    }
  }

  const photos: string[] = Array.isArray(order.photos) ? order.photos : [];
  const status = statusLabels[order.status] || statusLabels.new;
  const decided = ["chosen", "completed", "cancelled"].includes(order.status);
  const list = quotes ?? [];

  return (
    <div className="max-w-3xl">
      <Link
        href="/klient"
        className="text-sm text-brand-chrom hover:text-brand-lime transition"
      >
        ← Wróć do moich zleceń
      </Link>

      <div className="flex items-center gap-3 mt-3 mb-1">
        <h1 className="text-2xl font-bold">
          {serviceLabels[order.service_type] || order.service_type}
          {order.car_brand && ` — ${order.car_brand} ${order.car_model || ""}`}
        </h1>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${status.color}`}
        >
          {status.text}
        </span>
      </div>
      <p className="text-brand-chrom mb-8">
        {order.city} · dodano{" "}
        {new Date(order.created_at).toLocaleDateString("pl-PL")}
      </p>

      {/* Szczegoly zapytania */}
      <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 mb-8 space-y-3">
        <h2 className="font-semibold mb-2">Szczegóły zlecenia</h2>
        <Detail
          label="Usługa"
          value={serviceLabels[order.service_type] || order.service_type}
        />
        {(order.car_brand || order.car_model) && (
          <Detail
            label="Pojazd"
            value={`${order.car_brand || ""} ${order.car_model || ""} ${
              order.car_year ? `(${order.car_year})` : ""
            }`.trim()}
          />
        )}
        {order.scope && (
          <Detail label="Zakres" value={scopeLabels[order.scope] || order.scope} />
        )}
        <Detail label="Miasto" value={order.city} />
        {order.description && (
          <div>
            <p className="text-xs text-brand-chrom uppercase tracking-wide mb-1">
              Opis
            </p>
            <p className="text-sm whitespace-pre-wrap">{order.description}</p>
          </div>
        )}
      </div>

      {/* Zdjecia */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt={`Zdjęcie ${i + 1}`}
              className="rounded-xl border border-brand-border object-cover w-full h-32"
            />
          ))}
        </div>
      )}

      {/* Oferty */}
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold">
          Oferty od studiów
          {list.length > 0 && (
            <span className="text-brand-chrom font-normal"> ({list.length})</span>
          )}
        </h2>
        {!decided && list.length > 0 && (
          <span className="text-xs text-brand-chrom">
            Możesz wybrać jedną ofertę
          </span>
        )}
      </div>

      {list.length === 0 ? (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-8 text-center">
          <p className="text-brand-chrom">
            Twoje zlecenie trafiło do studiów. Gdy prześlą wyceny, pojawią się
            tutaj — porównasz maksymalnie 3 oferty i wybierzesz jedną.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((q) => {
            const studio = studioMap[q.studio_id];
            const isChosen = order.chosen_quote_id === q.id;
            const isRejected = decided && !isChosen;
            return (
              <div
                key={q.id}
                className={`rounded-2xl p-6 border transition ${
                  isChosen
                    ? "bg-brand-lime/5 border-brand-lime/40"
                    : isRejected
                    ? "bg-brand-grafit-light border-brand-border opacity-50"
                    : "bg-brand-grafit-light border-brand-border"
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="font-semibold">
                      {studio?.business_name || "Studio"}
                    </p>
                    {studio?.city && (
                      <p className="text-sm text-brand-chrom">{studio.city}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-brand-lime">
                      {q.price_max
                        ? `${q.price_min}–${q.price_max} zł`
                        : `od ${q.price_min} zł`}
                    </p>
                    {q.estimated_days != null && (
                      <p className="text-xs text-brand-chrom mt-1">
                        realizacja ~{q.estimated_days} dni
                      </p>
                    )}
                  </div>
                </div>

                {q.comment && (
                  <p className="text-sm whitespace-pre-wrap text-brand-kosc/90 mb-4">
                    {q.comment}
                  </p>
                )}

                {isChosen ? (
                  <div className="flex items-center gap-2 text-sm font-medium text-brand-lime">
                    ✓ Wybrane studio
                    {studio?.slug && (
                      <a
                        href={`https://zlecoklejanie.pl/studio/${studio.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-chrom hover:text-brand-lime underline underline-offset-2"
                      >
                        zobacz profil →
                      </a>
                    )}
                  </div>
                ) : isRejected ? (
                  <p className="text-sm text-brand-chrom">Nie wybrano</p>
                ) : (
                  <ChooseQuoteButton
                    quoteId={q.id}
                    orderId={order.id}
                    studioName={studio?.business_name || "to studio"}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-brand-chrom">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
