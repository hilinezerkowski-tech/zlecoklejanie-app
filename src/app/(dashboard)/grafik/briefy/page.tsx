import { createClient } from "@/lib/supabase/server";
import { BriefActions } from "./brief-actions";
import { DesignerQuoteForm } from "./quote-form";
import { MessageThread, type ThreadMessage } from "@/components/ui/message-thread";
import { ContactCard, type OrderContact } from "@/components/ui/contact-card";

export const dynamic = "force-dynamic";

const statusInfo: Record<string, { label: string; color: string }> = {
  pending: { label: "Czeka na Twoją odpowiedź", color: "bg-amber-400/15 text-amber-400" },
  accepted: { label: "Bierzesz ten projekt", color: "bg-brand-lime/15 text-brand-lime" },
  rejected: { label: "Odrzucony", color: "bg-red-400/15 text-red-400" },
};

const quoteInfo: Record<string, { label: string; color: string }> = {
  sent: { label: "Wycena wysłana", color: "bg-blue-400/15 text-blue-400" },
  chosen: { label: "Klient wybrał Ciebie 🎉", color: "bg-brand-lime/15 text-brand-lime" },
  rejected: { label: "Klient wybrał innego grafika", color: "bg-red-400/15 text-red-400" },
};

function cena(q: { price_min: number; price_max: number | null }): string {
  return q.price_max && q.price_max !== q.price_min
    ? `${q.price_min}–${q.price_max} zł`
    : `${q.price_min} zł`;
}

export default async function GrafikBriefyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS: grafik widzi wyłącznie własne przypisania. Treść briefu to migawka
  // wysłana przez admina — danych kontaktowych klienta nie wydajemy tu w ogóle.
  const { data: briefs } = await supabase
    .from("order_designer_assignments")
    .select("id, order_id, brief, status, assigned_at, responded_at, response_note")
    .eq("designer_id", user!.id)
    .order("assigned_at", { ascending: false });

  const rows = briefs || [];
  const orderIds = rows.map((b) => b.order_id);

  // Własne wyceny + rozmowy (RLS filtruje po designer_id = auth.uid())
  const wyceny: Record<string, any> = {};
  const rozmowy: Record<string, ThreadMessage[]> = {};
  const kontakty: Record<string, OrderContact> = {};

  if (orderIds.length > 0) {
    const [{ data: quotes }, { data: msgs }] = await Promise.all([
      supabase
        .from("designer_quotes")
        .select("id, order_id, price_min, price_max, estimated_days, comment, status")
        .in("order_id", orderIds),
      supabase
        .from("order_designer_messages")
        .select("id, order_id, sender_role, body, created_at")
        .in("order_id", orderIds)
        .order("created_at", { ascending: true }),
    ]);

    for (const q of quotes ?? []) wyceny[q.order_id] = q;
    for (const m of msgs ?? []) {
      (rozmowy[m.order_id] ||= []).push(m as ThreadMessage);
    }

    // Kontakt do klienta — RPC wydaje go dopiero po wyborze tego grafika
    for (const q of quotes ?? []) {
      if (q.status !== "chosen") continue;
      const { data } = await supabase.rpc("get_order_designer_contact", {
        p_order_id: q.order_id,
      });
      const row = Array.isArray(data) ? data[0] : null;
      if (row) kontakty[q.order_id] = row as OrderContact;
    }
  }

  const czekajace = rows.filter((b) => b.status === "pending").length;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Briefy</h1>
      <p className="text-brand-chrom mb-8">
        Projekty, do których Cię skierowaliśmy.
        {czekajace > 0 && (
          <span className="text-brand-lime font-medium">
            {" "}
            Czeka na odpowiedź: {czekajace}
          </span>
        )}
      </p>

      {rows.length === 0 ? (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-12 text-center">
          <p className="text-brand-chrom mb-2">Nie masz jeszcze żadnego briefu</p>
          <p className="text-sm text-brand-chrom/60">
            Kierujemy je do aktywnych grafików z uzupełnionym profilem. Gdy pojawi
            się pasujący projekt, dostaniesz maila.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((b) => {
            const st = statusInfo[b.status] || {
              label: b.status,
              color: "bg-white/10 text-brand-chrom",
            };
            const q = wyceny[b.order_id];
            const qi = q ? quoteInfo[q.status] : null;
            const kontakt = kontakty[b.order_id];
            const watek = rozmowy[b.order_id] || [];
            // Po wyborze innego grafika rozmowa jest tylko do odczytu (migracja 015)
            const mozePisac = Boolean(q) && q.status !== "rejected";

            return (
              <div
                key={b.id}
                className={`bg-brand-grafit-light border rounded-2xl p-6 ${
                  b.status === "pending" ? "border-brand-lime/50" : "border-brand-border"
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}>
                      {st.label}
                    </span>
                    {qi && (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${qi.color}`}>
                        {qi.label}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-brand-chrom">
                    {new Date(b.assigned_at).toLocaleString("pl-PL", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Europe/Warsaw",
                    })}
                  </span>
                </div>

                <p className="text-sm whitespace-pre-wrap">{b.brief}</p>

                {b.response_note && (
                  <p className="mt-3 text-sm text-brand-chrom">
                    Twój komentarz: {b.response_note}
                  </p>
                )}

                {q && (
                  <div className="mt-4 p-4 bg-brand-grafit border border-brand-border rounded-xl">
                    <p className="text-sm font-medium">
                      Twoja wycena: {cena(q)}
                      {q.estimated_days ? ` · ${q.estimated_days} dni` : ""}
                    </p>
                    {q.comment && (
                      <p className="mt-1 text-sm text-brand-chrom whitespace-pre-wrap">
                        {q.comment}
                      </p>
                    )}
                  </div>
                )}

                {kontakt && (
                  <div className="mt-4">
                    <ContactCard contact={kontakt} />
                  </div>
                )}

                {b.status === "pending" && !q ? (
                  <BriefActions assignmentId={b.id} />
                ) : b.status === "rejected" ? (
                  <p className="mt-4 pt-4 border-t border-brand-border text-sm text-brand-chrom">
                    Odpowiedź zapisana.
                    {b.responded_at &&
                      ` · ${new Date(b.responded_at).toLocaleDateString("pl-PL")}`}
                  </p>
                ) : (
                  <DesignerQuoteForm assignmentId={b.id} quote={q ?? null} />
                )}

                {q && (
                  <MessageThread
                    track="designer"
                    orderId={b.order_id}
                    studioId={user!.id}
                    viewer="designer"
                    messages={watek}
                    canWrite={mozePisac}
                    otherPartyName="Klient"
                    closedNote="Rozmowa zamknięta — klient wybrał innego grafika."
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
