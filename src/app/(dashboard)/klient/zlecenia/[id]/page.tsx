import { createClient } from "@/lib/supabase/server";
import { signedPhotoUrls } from "@/lib/order-photos";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChooseQuoteButton } from "./choose-quote-button";
import { ChooseDesignerButton } from "./choose-designer-button";
import { ContactCard, type OrderContact } from "@/components/ui/contact-card";
import { MessageThread, type ThreadMessage } from "@/components/ui/message-thread";

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
      "id, service_type, car_brand, car_model, car_year, scope, city, description, photos, status, chosen_quote_id, needs_designer, created_at"
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
    {
      business_name: string;
      city: string | null;
      slug: string | null;
      verified_at: string | null;
    }
  > = {};
  // Studia ukryte przez admina (miękkie usunięcie) — ich wycen klient nie wybiera
  const deletedStudioIds = new Set<string>();
  if (studioIds.length > 0) {
    const { data: studios } = await supabase
      .from("studios")
      // UWAGA: tabela studios nie ma kolumny `city` — miasto siedzi w `address`.
      // Pytanie o nieistniejaca kolumne zwracalo blad i klient widzial
      // wszedzie generyczne "Studio" zamiast nazwy firmy.
      .select("id, business_name, address, slug, verified_at, deleted_at")
      .in("id", studioIds);
    for (const s of studios ?? []) {
      if (s.deleted_at) deletedStudioIds.add(s.id);
      studioMap[s.id] = {
        business_name: s.business_name,
        city: s.address,
        slug: s.slug,
        verified_at: s.verified_at,
      };
    }
  }

  // Rozmowy ze studiami (RLS: klient widzi tylko rozmowy swoich zleceń)
  const { data: messages } = await supabase
    .from("order_messages")
    .select("id, studio_id, sender_role, body, created_at")
    .eq("order_id", params.id)
    .order("created_at", { ascending: true });
  const threadFor = (studioId: string): ThreadMessage[] =>
    (messages ?? []).filter((m: any) => m.studio_id === studioId) as ThreadMessage[];

  const photos: string[] = Array.isArray(order.photos) ? order.photos : [];
  const photoUrls = await signedPhotoUrls(photos);
  const status = statusLabels[order.status] || statusLabels.new;
  const decided = ["chosen", "completed", "cancelled"].includes(order.status);
  // Wycena usuniętego studia znika z porównania; zostaje tylko, gdy klient
  // już ją wybrał (historia rozstrzygniętego zlecenia musi być kompletna).
  const list = (quotes ?? []).filter(
    (q) => !deletedStudioIds.has(q.studio_id) || q.id === order.chosen_quote_id
  );

  // ----- Tor grafika (migracja 015). Niezalezny od wyboru studia. -----
  const { data: designerQuotes } = await supabase
    .from("designer_quotes")
    .select("id, designer_id, price_min, price_max, estimated_days, comment, status, created_at")
    .eq("order_id", params.id)
    .order("created_at", { ascending: true });

  const designerIds = Array.from(
    new Set((designerQuotes ?? []).map((q) => q.designer_id))
  );
  const designerMap: Record<string, { display_name: string; city: string | null }> = {};
  if (designerIds.length > 0) {
    // RLS: klient widzi aktywnych grafikow (migracja 015). Kontakt siedzi
    // w `profiles` i wydaje go dopiero RPC po wyborze.
    const { data: ds } = await supabase
      .from("designers")
      .select("id, display_name, city")
      .in("id", designerIds);
    for (const d of ds ?? []) {
      designerMap[d.id] = { display_name: d.display_name, city: d.city };
    }
  }

  const { data: designerMessages } = await supabase
    .from("order_designer_messages")
    .select("id, designer_id, sender_role, body, created_at")
    .eq("order_id", params.id)
    .order("created_at", { ascending: true });
  const designerThreadFor = (designerId: string): ThreadMessage[] =>
    (designerMessages ?? []).filter(
      (m: any) => m.designer_id === designerId
    ) as ThreadMessage[];

  const wybranyGrafik = (designerQuotes ?? []).find((q) => q.status === "chosen");

  let designerContact: OrderContact | null = null;
  if (wybranyGrafik) {
    const { data: rows } = await supabase.rpc("get_order_designer_contact", {
      p_order_id: params.id,
    });
    if (Array.isArray(rows) && rows.length > 0) {
      designerContact = rows[0] as OrderContact;
    }
  }

  // Kontakt do wybranego studia — RPC SECURITY DEFINER wydaje dane tylko
  // stronom rozstrzygnietego zlecenia (patrz migracja 010)
  let contact: OrderContact | null = null;
  if (["chosen", "completed"].includes(order.status)) {
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
      {photoUrls.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {photoUrls.map((src, i) => (
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

      {/* Kontakt do wybranego studia */}
      {contact && <ContactCard contact={contact} />}

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
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">
                        {studio?.business_name || "Studio"}
                      </p>
                      {studio?.verified_at && (
                        <span
                          title="Firme sprawdzilismy: NIP, adres i realizacje"
                          className="text-xs px-2 py-0.5 rounded-full font-medium bg-teal-400/15 text-teal-400"
                        >
                          ✓ Zweryfikowane
                        </span>
                      )}
                    </div>
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

                {/* Rozmowa z tym studiem — zasady otwarcia jak w migracji 012 */}
                <MessageThread
                  orderId={order.id}
                  studioId={q.studio_id}
                  viewer="client"
                  messages={threadFor(q.studio_id)}
                  otherPartyName={studio?.business_name || "Studio"}
                  canWrite={
                    !["completed", "cancelled"].includes(order.status) &&
                    (order.status !== "chosen" || isChosen)
                  }
                  closedNote="Rozmowa zamknięta."
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Graficy — tor niezalezny od wyboru studia (migracja 015) */}
      {(order.needs_designer || (designerQuotes && designerQuotes.length > 0)) && (
        <div className="mt-10">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-lg font-semibold">
              Projekt graficzny
              {designerQuotes && designerQuotes.length > 0 && (
                <span className="text-brand-chrom font-normal"> ({designerQuotes.length})</span>
              )}
            </h2>
          </div>
          <p className="text-sm text-brand-chrom mb-4">
            Grafika wybierasz osobno od studia — to dwie różne usługi i dwie różne
            decyzje.
          </p>

          {designerContact && <ContactCard contact={designerContact} />}

          {!designerQuotes || designerQuotes.length === 0 ? (
            <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
              <p className="text-sm text-brand-chrom">
                Szukamy dla Ciebie grafika. Gdy przyśle wycenę, dostaniesz maila.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {designerQuotes.map((q: any) => {
                const d = designerMap[q.designer_id];
                const wybrany = q.status === "chosen";
                const odrzucony = q.status === "rejected";
                const nazwa = d?.display_name || "Grafik";
                return (
                  <div
                    key={q.id}
                    className={`bg-brand-grafit-light border rounded-2xl p-6 ${
                      wybrany ? "border-brand-lime/60" : "border-brand-border"
                    } ${odrzucony ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{nazwa}</p>
                          {wybrany && (
                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-brand-lime/15 text-brand-lime">
                              Wybrany
                            </span>
                          )}
                        </div>
                        {d?.city && <p className="text-sm text-brand-chrom">{d.city}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-bold">
                          {q.price_max && q.price_max !== q.price_min
                            ? `${q.price_min}–${q.price_max} zł`
                            : `${q.price_min} zł`}
                        </p>
                        {q.estimated_days && (
                          <p className="text-xs text-brand-chrom">
                            realizacja: {q.estimated_days} dni
                          </p>
                        )}
                      </div>
                    </div>

                    {q.comment && (
                      <p className="mt-3 text-sm text-brand-chrom whitespace-pre-wrap">
                        {q.comment}
                      </p>
                    )}

                    {!wybranyGrafik && !["completed", "cancelled"].includes(order.status) && (
                      <ChooseDesignerButton
                        quoteId={q.id}
                        orderId={order.id}
                        designerName={nazwa}
                      />
                    )}

                    <MessageThread
                      track="designer"
                      orderId={order.id}
                      studioId={q.designer_id}
                      viewer="client"
                      messages={designerThreadFor(q.designer_id)}
                      otherPartyName={nazwa}
                      canWrite={
                        !["completed", "cancelled"].includes(order.status) &&
                        (!wybranyGrafik || wybrany)
                      }
                      closedNote="Rozmowa zamknięta — wybrałeś innego grafika."
                    />
                  </div>
                );
              })}
            </div>
          )}
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
