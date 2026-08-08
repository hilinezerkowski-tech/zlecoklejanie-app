import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import LeadActions from "./lead-actions";

// Leady zawierają dane kontaktowe — strona musi być zawsze świeża i nie może
// trafić do cache CDN.
export const dynamic = "force-dynamic";

type Lead = {
  id: string;
  kind: string;
  payload: Record<string, string> | null;
  status: string;
  created_at: string;
  order_id: string | null;
};

const kindLabels: Record<string, { label: string; color: string }> = {
  zlecenie: { label: "Klient", color: "bg-brand-lime/15 text-brand-lime" },
  studio: { label: "Studio", color: "bg-blue-400/15 text-blue-400" },
  grafik: { label: "Grafik", color: "bg-purple-400/15 text-purple-400" },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  new: { label: "Nowy", color: "bg-amber-400/15 text-amber-400" },
  handled: { label: "Obsłużony", color: "bg-teal-400/15 text-teal-400" },
  spam: { label: "Spam", color: "bg-red-400/15 text-red-400" },
};

// Kolejność i polskie etykiety pól z formularzy na landing page.
const fieldLabels: Record<string, string> = {
  usluga: "Usługa",
  auto: "Auto",
  miasto: "Miasto",
  szczegoly: "Szczegóły",
  potrzebuje_grafika: "Potrzebuje grafika",
  nazwa: "Nazwa",
  instagram: "Instagram",
  portfolio: "Portfolio",
  specjalizacja: "Specjalizacja",
  email: "E-mail",
  telefon: "Telefon",
};

export default async function LeadyPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string }>;
}) {
  const params = await searchParams;

  // Kontrola uprawnień PRZED użyciem klucza service role.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/");

  // landing_leads nie ma polityki SELECT (celowo) — czytamy service rolem.
  const admin = createAdminClient();
  let query = admin
    .from("landing_leads")
    .select("id, kind, payload, status, created_at, order_id")
    .order("created_at", { ascending: false })
    .limit(200);

  if (params.kind) query = query.eq("kind", params.kind);
  if (params.status) query = query.eq("status", params.status);

  const { data, error } = await query;
  const leads = (data ?? []) as Lead[];
  const newCount = leads.filter((l) => l.status === "new").length;

  const filters: { label: string; href: string; active: boolean }[] = [
    { label: "Wszystkie", href: "/admin/leady", active: !params.kind && !params.status },
    { label: "Nowe", href: "/admin/leady?status=new", active: params.status === "new" },
    { label: "Klienci", href: "/admin/leady?kind=zlecenie", active: params.kind === "zlecenie" },
    { label: "Studia", href: "/admin/leady?kind=studio", active: params.kind === "studio" },
    { label: "Graficy", href: "/admin/leady?kind=grafik", active: params.kind === "grafik" },
    { label: "Obsłużone", href: "/admin/leady?status=handled", active: params.status === "handled" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Leady z landing page</h1>
        <span className="text-sm text-brand-chrom">
          {leads.length} zgłoszeń{newCount > 0 && ` · ${newCount} nowych`}
        </span>
      </div>
      <p className="text-sm text-brand-chrom/70 mb-8">
        Zgłoszenia z formularzy na zlecoklejanie.pl. Lead klienta jednym kliknięciem
        zamieniasz na zlecenie — konto klienta powstaje automatycznie.
      </p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {filters.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              f.active
                ? "bg-brand-lime/15 text-brand-lime"
                : "text-brand-chrom hover:text-brand-kosc hover:bg-white/5"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {error && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-2xl p-6 mb-6">
          <p className="text-sm text-red-400">
            Nie udało się pobrać leadów: {error.message}
          </p>
          <p className="text-xs text-red-400/70 mt-2">
            Jeśli błąd dotyczy brakującej tabeli lub kolumny — uruchom migrację
            <code className="mx-1">006_landing_leads.sql</code> w Supabase.
          </p>
        </div>
      )}

      {leads.length === 0 && !error ? (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-12 text-center">
          <p className="text-brand-chrom mb-2">Brak leadów</p>
          <p className="text-sm text-brand-chrom/60">
            Tu wpadają zgłoszenia z formularzy na stronie głównej.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => {
            const k = kindLabels[lead.kind] || {
              label: lead.kind,
              color: "bg-gray-400/15 text-gray-400",
            };
            const st = statusLabels[lead.status] || {
              label: lead.status,
              color: "bg-gray-400/15 text-gray-400",
            };
            const p = lead.payload || {};
            const entries = Object.entries(p).filter(([, v]) => v && String(v).trim());

            return (
              <div
                key={lead.id}
                className={`bg-brand-grafit-light border rounded-2xl p-5 transition ${
                  lead.status === "new" ? "border-brand-lime/30" : "border-brand-border"
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${k.color}`}>
                      {k.label}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}>
                      {st.label}
                    </span>
                    <span className="text-xs text-brand-chrom">
                      {new Date(lead.created_at).toLocaleString("pl-PL")}
                    </span>
                  </div>

                  <LeadActions
                    leadId={lead.id}
                    kind={lead.kind}
                    status={lead.status}
                    orderId={lead.order_id}
                  />
                </div>

                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {entries.map(([key, value]) => (
                    <div key={key} className="text-sm">
                      <dt className="text-xs text-brand-chrom mb-0.5">
                        {fieldLabels[key] || key}
                      </dt>
                      <dd className="text-brand-kosc break-words whitespace-pre-wrap">
                        {key === "email" ? (
                          <a href={`mailto:${value}`} className="hover:text-brand-lime transition">
                            {value}
                          </a>
                        ) : key === "telefon" ? (
                          <a href={`tel:${value}`} className="hover:text-brand-lime transition">
                            {value}
                          </a>
                        ) : (
                          String(value)
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
