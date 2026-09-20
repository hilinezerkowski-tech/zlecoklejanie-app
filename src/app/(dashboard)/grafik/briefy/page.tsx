import { createClient } from "@/lib/supabase/server";
import { BriefActions } from "./brief-actions";

export const dynamic = "force-dynamic";

const statusInfo: Record<string, { label: string; color: string }> = {
  pending: { label: "Czeka na Twoją odpowiedź", color: "bg-amber-400/15 text-amber-400" },
  accepted: { label: "Bierzesz ten projekt", color: "bg-brand-lime/15 text-brand-lime" },
  rejected: { label: "Odrzucony", color: "bg-red-400/15 text-red-400" },
};

export default async function GrafikBriefyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS: grafik widzi wyłącznie własne przypisania. Treść briefu to migawka
  // wysłana przez admina — danych kontaktowych klienta nie wydajemy tu w ogóle.
  const { data: briefs } = await supabase
    .from("order_designer_assignments")
    .select("id, brief, status, assigned_at, responded_at, response_note")
    .eq("designer_id", user!.id)
    .order("assigned_at", { ascending: false });

  const rows = briefs || [];
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
            return (
              <div
                key={b.id}
                className={`bg-brand-grafit-light border rounded-2xl p-6 ${
                  b.status === "pending" ? "border-brand-lime/50" : "border-brand-border"
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}>
                    {st.label}
                  </span>
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

                {b.status === "pending" ? (
                  <BriefActions assignmentId={b.id} />
                ) : (
                  <p className="mt-4 pt-4 border-t border-brand-border text-sm text-brand-chrom">
                    {b.status === "accepted"
                      ? "Odezwiemy się z kontaktem do klienta."
                      : "Odpowiedź zapisana."}
                    {b.responded_at &&
                      ` · ${new Date(b.responded_at).toLocaleDateString("pl-PL")}`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
