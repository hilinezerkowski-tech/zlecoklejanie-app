import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { QuoteForm } from "./quote-form";
import { ContactCard, type OrderContact } from "@/components/ui/contact-card";

// Etykiety spójne z listą zleceń i panelem admina
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

export default async function StudioOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Czy to zlecenie jest przypisane do tego studia?
  const { data: assignment } = await supabase
    .from("order_assignments")
    .select("id, status")
    .eq("order_id", params.id)
    .eq("studio_id", user!.id)
    .single();

  // Brak przypisania → studio nie ma dostępu do tego zlecenia
  if (!assignment) notFound();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, service_type, car_brand, car_model, car_year, scope, city, description, photos, status, created_at"
    )
    .eq("id", params.id)
    .single();

  if (!order) notFound();

  // Wycena tego studia (jeśli już wysłana)
  const { data: existingQuote } = await supabase
    .from("quotes")
    .select(
      "id, price_min, price_max, comment, estimated_days, status, created_at"
    )
    .eq("order_id", params.id)
    .eq("studio_id", user!.id)
    .maybeSingle();

  const photos: string[] = Array.isArray(order.photos) ? order.photos : [];

  // Rozstrzygniecie: czy klient juz wybral studio i czy to MY wygralismy
  const decided = ["chosen", "completed"].includes(order.status);
  const won = decided && existingQuote?.status === "chosen";
  const lost = decided && !won;

  // Kontakt do klienta — RPC SECURITY DEFINER wydaje dane tylko wybranemu
  // studiu po rozstrzygnieciu (patrz migracja 010)
  let contact: OrderContact | null = null;
  if (won) {
    const { data: contactRows } = await supabase.rpc("get_order_contact", {
      p_order_id: params.id,
    });
    if (Array.isArray(contactRows) && contactRows.length > 0) {
      contact = contactRows[0] as OrderContact;
    }
  }

  return (
    <div className="max-w-3xl">
      <Link
        href="/studio/zlecenia"
        className="text-sm text-brand-chrom hover:text-brand-lime transition"
      >
        ← Wróć do zleceń
      </Link>

      <h1 className="text-2xl font-bold mt-3 mb-1">
        {serviceLabels[order.service_type] || order.service_type}
        {order.car_brand && ` — ${order.car_brand} ${order.car_model || ""}`}
      </h1>
      <p className="text-brand-chrom mb-8">
        {order.city} · dodano{" "}
        {new Date(order.created_at).toLocaleDateString("pl-PL")}
      </p>

      {/* Szczegóły zapytania */}
      <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 mb-6 space-y-3">
        <h2 className="font-semibold mb-2">Szczegóły zapytania</h2>
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
          <Detail
            label="Zakres"
            value={scopeLabels[order.scope] || order.scope}
          />
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

      {/* Zdjęcia */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
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

      {/* Wynik rozstrzygniecia */}
      {won && contact && <ContactCard contact={contact} />}
      {lost && (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 mb-6">
          <h2 className="font-semibold mb-2">Klient wybrał inne studio</h2>
          <p className="text-sm text-brand-chrom">
            Tym razem się nie udało — klient zdecydował się na inną ofertę.
            Twoja wycena pozostaje w historii poniżej. Kolejne zlecenia z
            Twojego regionu trafią do Ciebie automatycznie.
          </p>
        </div>
      )}

      {/* Wycena */}
      {existingQuote ? (
        <div className="bg-brand-lime/5 border border-brand-lime/30 rounded-2xl p-6">
          <h2 className="font-semibold text-brand-lime mb-3">
            Twoja wycena została wysłana
          </h2>
          <div className="space-y-2">
            <Detail
              label="Cena"
              value={
                existingQuote.price_max
                  ? `${existingQuote.price_min} – ${existingQuote.price_max} zł`
                  : `od ${existingQuote.price_min} zł`
              }
            />
            {existingQuote.estimated_days != null && (
              <Detail
                label="Czas realizacji"
                value={`${existingQuote.estimated_days} dni`}
              />
            )}
            {existingQuote.comment && (
              <div>
                <p className="text-xs text-brand-chrom uppercase tracking-wide mb-1">
                  Komentarz
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  {existingQuote.comment}
                </p>
              </div>
            )}
          </div>
          <p className="text-xs text-brand-chrom mt-4">
            Wysłano{" "}
            {new Date(existingQuote.created_at).toLocaleDateString("pl-PL")}.
            Klient porówna oferty i wybierze studio.
          </p>
        </div>
      ) : (
        <QuoteForm
          orderId={order.id}
          studioId={user!.id}
          assignmentId={assignment.id}
        />
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
