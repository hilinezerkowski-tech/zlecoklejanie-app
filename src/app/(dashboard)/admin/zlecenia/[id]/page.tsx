import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AssignStudioForm } from "./assign-form";
import { OutcomeButtons } from "./outcome-buttons";
import { OrderStatusControl } from "./status-control";
import { AssignmentActions } from "./assignment-actions";
import { OrderDetailsEditor, ClientEditor } from "./order-edit";
import { MessageThread, type ThreadMessage } from "@/components/ui/message-thread";
import { sortujWgOdleglosci } from "@/lib/geo";
import { domyslnyBrief } from "@/lib/designer-brief";
import {
  AssignDesignerForm,
  DesignerAssignmentActions,
  MAX_GRAFIKOW,
  NeedsDesignerToggle,
} from "./designer-section";

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

  // Rozmowy klient <-> studia (admin: podgląd wszystkich)
  const { data: messages } = await supabase
    .from("order_messages")
    .select("id, studio_id, sender_role, body, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  // Historia powiadomień: maile powiązane ze zleceniem + maile z leada,
  // z którego zlecenie powstało (autoresponder "przyjęliśmy zapytanie").
  const { data: sourceLeads } = await supabase
    .from("landing_leads")
    .select("id")
    .eq("order_id", id);
  const leadIds = (sourceLeads || []).map((l: any) => l.id);

  const logFilter =
    leadIds.length > 0
      ? `order_id.eq.${id},lead_id.in.(${leadIds.join(",")})`
      : `order_id.eq.${id}`;

  const { data: emailLog } = await supabase
    .from("email_log")
    .select("id, created_at, event, recipient, recipient_role, subject, status, provider_id, error")
    .or(logFilter)
    .order("created_at", { ascending: false });

  // Pobierz dostępne studia do przypisania
  const { data: availableStudios } = await supabase
    .from("studios")
    // UWAGA: tabela studios nie ma kolumny `city` — miasto parsuje geo.ts z `address`.
    .select("id, business_name, address, specializations")
    .eq("status", "active")
    .is("deleted_at", null);

  const assignedStudioIds = (assignments || []).map(
    (a: any) => a.studio?.id
  );

  const unassignedStudios = sortujWgOdleglosci(
    (availableStudios || []).filter(
      (s: any) => !assignedStudioIds.includes(s.id)
    ),
    order.city
  );

  // Dobór grafika (migracja 014). Brief widzi grafik, więc bierzemy tylko
  // dane zlecenia — kontakt do klienta zostaje po stronie admina.
  const { data: designerAssignments } = await supabase
    .from("order_designer_assignments")
    .select(`
      id,
      designer_id,
      brief,
      status,
      email_status,
      email_error,
      assigned_at,
      responded_at,
      response_note,
      designer:designers!order_designer_assignments_designer_id_fkey(display_name, city)
    `)
    .eq("order_id", id)
    .order("assigned_at", { ascending: true });

  // Wyceny grafikow i rozmowy z klientem (migracja 015) — admin tylko czyta
  const { data: designerQuotes } = await supabase
    .from("designer_quotes")
    .select("id, designer_id, price_min, price_max, estimated_days, comment, status")
    .eq("order_id", id);
  const wycenaGrafika: Record<string, any> = {};
  for (const q of designerQuotes || []) wycenaGrafika[q.designer_id] = q;

  const { data: designerMessages } = await supabase
    .from("order_designer_messages")
    .select("id, designer_id, sender_role, body, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: true });
  const rozmowaGrafika = (designerId: string): ThreadMessage[] =>
    (designerMessages ?? []).filter(
      (m: any) => m.designer_id === designerId
    ) as ThreadMessage[];

  const przypisaniGraficy = (designerAssignments || []).map((a: any) => a.designer_id);
  const { data: aktywniGraficy } = await supabase
    .from("designers")
    .select("id, display_name, city, specializations, works_on_vehicle_templates")
    .eq("status", "active")
    .order("display_name");
  const wolniGraficy = (aktywniGraficy || []).filter(
    (d: any) => !przypisaniGraficy.includes(d.id)
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

  const eventLabels: Record<string, string> = {
    assigned: "Nowe zlecenie do wyceny",
    assigned_resend: "Nowe zlecenie do wyceny (wysłane ponownie)",
    quoted: "Nowa oferta od studia",
    chosen_studio: "Klient wybrał ofertę",
    chosen_client: "Potwierdzenie wyboru studia",
    lead_admin_alert: "Alert o nowym leadzie",
    lead_autoreply: "Potwierdzenie przyjęcia zapytania",
    message: "Nowa wiadomość w rozmowie",
    designer_brief: "Brief do grafika",
    designer_brief_resend: "Brief do grafika (wysłany ponownie)",
    designer_quote: "Wycena od grafika",
    designer_quote_update: "Zmieniona wycena grafika",
    designer_chosen: "Klient wybrał grafika",
    designer_chosen_client: "Potwierdzenie wyboru grafika",
    designer_message: "Nowa wiadomość (grafik)",
  };

  const roleLabels: Record<string, string> = {
    client: "Klient",
    studio: "Studio",
    designer: "Grafik",
    admin: "Admin",
    lead: "Klient (formularz)",
  };

  const logStatus: Record<string, { label: string; color: string }> = {
    sent: { label: "Wysłano", color: "bg-brand-lime/15 text-brand-lime" },
    failed: { label: "Błąd", color: "bg-red-400/15 text-red-400" },
    skipped: { label: "Pominięto", color: "bg-gray-400/15 text-gray-400" },
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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {order.needs_designer && (
            <span className="text-sm px-3 py-1 rounded-full font-medium bg-purple-400/15 text-purple-400">
              🎨 Grafik
            </span>
          )}
          <span className={`text-sm px-3 py-1 rounded-full font-medium ${st.color}`}>
            {st.label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dane zlecenia */}
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Dane zlecenia</h2>
            <OrderDetailsEditor
              order={{
                id: order.id,
                service_type: order.service_type,
                scope: order.scope,
                city: order.city,
                car_brand: order.car_brand,
                car_model: order.car_model,
                car_year: order.car_year,
                description: order.description,
                estimated_min: order.estimated_min,
                estimated_max: order.estimated_max,
              }}
            />
          </div>
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
              <p className="text-sm whitespace-pre-line">{order.description}</p>
            </div>
          )}
        </div>

        {/* Dane klienta */}
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Klient</h2>
            <ClientEditor
              orderId={order.id}
              client={
                order.client
                  ? {
                      email: order.client.email ?? null,
                      full_name: order.client.full_name ?? null,
                      phone: order.client.phone ?? null,
                    }
                  : null
              }
            />
          </div>
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
                <div className="flex items-center gap-3">
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
                  <AssignmentActions
                    orderId={order.id}
                    studioId={a.studio?.id}
                    studioName={a.studio?.business_name || "Studio"}
                    status={a.status}
                  />
                </div>
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
            orderCity={order.city}
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

      {/* Dobór grafika */}
      <div className="mt-6 bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 mb-1 flex-wrap">
          <h2 className="font-semibold">
            Dobór grafika ({designerAssignments?.length || 0}/{MAX_GRAFIKOW})
          </h2>
          <NeedsDesignerToggle orderId={order.id} value={!!order.needs_designer} />
        </div>
        <p className="text-sm text-brand-chrom mb-4">
          {order.needs_designer
            ? "Klient prosi o dobranie grafika. Wyślij brief — grafik odpowiada w swoim panelu."
            : "To zlecenie nie ma sygnału „chcę grafika”. Brief i tak możesz wysłać."}
        </p>

        {designerAssignments && designerAssignments.length > 0 ? (
          <div className="space-y-3 mb-4">
            {designerAssignments.map((a: any) => {
              const d = Array.isArray(a.designer) ? a.designer[0] : a.designer;
              const odp = {
                pending: { label: "Czeka na odpowiedź", color: "bg-amber-400/15 text-amber-400" },
                accepted: { label: "Bierze projekt", color: "bg-brand-lime/15 text-brand-lime" },
                rejected: { label: "Odmówił", color: "bg-red-400/15 text-red-400" },
              }[a.status as string] || { label: a.status, color: "bg-white/10 text-brand-chrom" };

              return (
                <div
                  key={a.id}
                  className="p-4 bg-brand-grafit border border-brand-border rounded-xl flex items-start justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-medium text-sm">{d?.display_name || "Grafik"}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${odp.color}`}>
                        {odp.label}
                      </span>
                      {a.email_status && a.email_status !== "sent" && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-400/15 text-red-400">
                          mail: {a.email_status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-brand-chrom">
                      {d?.city ? `${d.city} · ` : ""}
                      wysłano {new Date(a.assigned_at).toLocaleDateString("pl-PL")}
                      {a.responded_at &&
                        ` · odpowiedź ${new Date(a.responded_at).toLocaleDateString("pl-PL")}`}
                    </p>
                    {a.response_note && (
                      <p className="mt-2 text-sm text-brand-chrom">
                        Komentarz grafika: {a.response_note}
                      </p>
                    )}
                    {a.email_error && (
                      <p className="mt-2 text-xs text-red-400">Błąd maila: {a.email_error}</p>
                    )}
                    <details className="mt-2">
                      <summary className="text-xs text-brand-chrom cursor-pointer hover:text-brand-kosc">
                        Pokaż wysłany brief
                      </summary>
                      <p className="mt-2 text-sm text-brand-chrom whitespace-pre-wrap">
                        {a.brief}
                      </p>
                    </details>

                    {wycenaGrafika[a.designer_id] && (
                      <div className="mt-3 p-3 bg-brand-grafit-light border border-brand-border rounded-lg">
                        <p className="text-sm font-medium">
                          Wycena:{" "}
                          {wycenaGrafika[a.designer_id].price_max &&
                          wycenaGrafika[a.designer_id].price_max !==
                            wycenaGrafika[a.designer_id].price_min
                            ? `${wycenaGrafika[a.designer_id].price_min}–${wycenaGrafika[a.designer_id].price_max} zł`
                            : `${wycenaGrafika[a.designer_id].price_min} zł`}
                          {wycenaGrafika[a.designer_id].estimated_days
                            ? ` · ${wycenaGrafika[a.designer_id].estimated_days} dni`
                            : ""}
                          {wycenaGrafika[a.designer_id].status === "chosen" && (
                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-medium bg-brand-lime/15 text-brand-lime">
                              Wybrany przez klienta
                            </span>
                          )}
                        </p>
                        {wycenaGrafika[a.designer_id].comment && (
                          <p className="mt-1 text-sm text-brand-chrom whitespace-pre-wrap">
                            {wycenaGrafika[a.designer_id].comment}
                          </p>
                        )}
                      </div>
                    )}

                    {rozmowaGrafika(a.designer_id).length > 0 && (
                      <MessageThread
                        track="designer"
                        orderId={order.id}
                        studioId={a.designer_id}
                        viewer="admin"
                        messages={rozmowaGrafika(a.designer_id)}
                        canWrite={false}
                        otherPartyName={d?.display_name || "Grafik"}
                      />
                    )}
                  </div>
                  <DesignerAssignmentActions orderId={order.id} designerId={a.designer_id} />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-brand-chrom mb-4">
            Żaden grafik nie dostał jeszcze briefu do tego zlecenia.
          </p>
        )}

        {(designerAssignments?.length || 0) < MAX_GRAFIKOW && wolniGraficy.length > 0 && (
          <AssignDesignerForm
            orderId={order.id}
            designers={wolniGraficy as any}
            defaultBrief={domyslnyBrief(order)}
          />
        )}

        {wolniGraficy.length === 0 && (
          <p className="text-sm text-brand-chrom/60">
            Brak aktywnych grafików do przypisania.{" "}
            <a href="/admin/graficy" className="text-brand-lime hover:underline">
              Dodaj grafika →
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

      {/* Wynik zlecenia */}
      <div className="mt-6 bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
        <h2 className="font-semibold mb-1">Wynik</h2>
        {["completed", "cancelled"].includes(order.status) ? (
          <p className="text-sm text-brand-chrom">
            {order.status === "completed"
              ? "✓ Zlecenie doszło do skutku."
              : "✕ Zlecenie nie doszło do skutku."}
          </p>
        ) : (
          <>
            <p className="text-sm text-brand-chrom mb-3">
              {order.status === "chosen"
                ? "Klient wybrał studio. Gdy potwierdzisz realizację (np. telefonicznie ze studiem), oznacz wynik."
                : "Klient jeszcze nie wybrał oferty."}
            </p>
            <OutcomeButtons orderId={order.id} />
          </>
        )}
        <OrderStatusControl orderId={order.id} status={order.status} />
      </div>

      {/* Rozmowy */}
      <div className="mt-6 bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
        <h2 className="font-semibold mb-4">Rozmowy klient ↔ studio</h2>
        {quotes && quotes.length > 0 ? (
          <div className="space-y-4">
            {quotes.map((q: any) => {
              const thread = (messages || []).filter(
                (m: any) => m.studio_id === q.studio_id
              ) as ThreadMessage[];
              const fromClient = thread.filter((m) => m.sender_role === "client").length;
              const fromStudio = thread.length - fromClient;
              const last = thread[thread.length - 1];
              const waitH = last
                ? Math.floor((Date.now() - new Date(last.created_at).getTime()) / 3600000)
                : 0;
              const open = !["completed", "cancelled"].includes(order.status);
              return (
                <div
                  key={q.id}
                  className="p-4 bg-brand-grafit border border-brand-border rounded-xl"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-sm">{q.studio?.business_name}</p>
                    <p className="text-xs text-brand-chrom">
                      {thread.length === 0
                        ? "Brak rozmowy"
                        : `Klient: ${fromClient} · Studio: ${fromStudio}`}
                    </p>
                  </div>
                  {last && open && (
                    <p
                      className={`text-xs mt-1 ${
                        waitH >= 24 ? "text-amber-400" : "text-brand-chrom/70"
                      }`}
                    >
                      Czeka na odpowiedź:{" "}
                      {last.sender_role === "client" ? "studio" : "klient"}
                      {waitH > 0 ? ` (od ${waitH} h)` : " (przed chwilą)"}
                    </p>
                  )}
                  {thread.length > 0 && (
                    <MessageThread
                      orderId={order.id}
                      studioId={q.studio_id}
                      viewer="admin"
                      messages={thread}
                      canWrite={false}
                      otherPartyName={q.studio?.business_name || "Studio"}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-brand-chrom">
            Rozmowy pojawią się, gdy studia wyślą wyceny.
          </p>
        )}
      </div>

      {/* Historia powiadomień */}
      <div className="mt-6 bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
        <h2 className="font-semibold mb-1">Historia powiadomień</h2>
        <p className="text-xs text-brand-chrom/60 mb-4">
          „Wysłano” = mail przyjęty przez Resend. Doręczenie i otwarcie sprawdzisz
          w logach Resend po ID wiadomości.
        </p>

        {emailLog && emailLog.length > 0 ? (
          <ol className="space-y-3">
            {emailLog.map((e: any) => {
              const ls = logStatus[e.status] || logStatus.skipped;
              return (
                <li
                  key={e.id}
                  className="p-4 bg-brand-grafit border border-brand-border rounded-xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">
                        {eventLabels[e.event] || e.event}
                      </p>
                      <p className="text-xs text-brand-chrom break-all">
                        {roleLabels[e.recipient_role] || e.recipient_role || "Odbiorca"}
                        {" · "}
                        {e.recipient}
                      </p>
                      <p className="text-xs text-brand-chrom/60 mt-1 break-words">
                        Temat: {e.subject}
                      </p>
                      {e.error && (
                        <p className="text-xs text-red-400 mt-1 break-words">
                          {e.error}
                        </p>
                      )}
                      {e.provider_id && (
                        <p className="text-[11px] text-brand-chrom/40 mt-1 break-all">
                          Resend ID: {e.provider_id}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${ls.color}`}
                      >
                        {ls.label}
                      </span>
                      <p className="text-xs text-brand-chrom/60 mt-2 whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString("pl-PL", {
                          timeZone: "Europe/Warsaw",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-brand-chrom">
            Brak zapisanych powiadomień. Maile wysłane przed wdrożeniem historii
            nie są tu widoczne — sprawdź je w logach Resend.
          </p>
        )}
      </div>
    </div>
  );
}
