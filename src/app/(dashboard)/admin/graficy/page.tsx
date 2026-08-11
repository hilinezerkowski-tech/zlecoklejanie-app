import { createClient } from "@/lib/supabase/server";
import { AddDesignerForm } from "./add-designer-form";
import { DesignerActions } from "./designer-actions";

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Oczekuje", color: "bg-amber-400/15 text-amber-400" },
  active: { label: "Aktywny", color: "bg-brand-lime/15 text-brand-lime" },
  suspended: { label: "Zawieszony", color: "bg-red-400/15 text-red-400" },
  rejected: { label: "Odrzucony", color: "bg-red-400/15 text-red-400" },
};

function priceRange(from: number | null, to: number | null): string | null {
  if (from && to) return `${from} – ${to} zł`;
  if (from) return `od ${from} zł`;
  if (to) return `do ${to} zł`;
  return null;
}

export default async function GraficyPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("designers")
    .select(
      `
      id,
      display_name,
      city,
      portfolio_url,
      instagram,
      website,
      specializations,
      software,
      works_on_vehicle_templates,
      price_from,
      price_to,
      monthly_capacity,
      status,
      verified_at,
      rejection_reason,
      created_at,
      profile:profiles!designers_id_fkey(email, full_name, phone)
    `
    )
    .order("created_at", { ascending: false });

  if (params.status) {
    query = query.eq("status", params.status);
  }

  const { data: designers, error } = await query;

  // Najczestsza przyczyna bledu tutaj: migracja 009 nie zostala uruchomiona
  // w Supabase. Mowimy to wprost, zamiast pokazywac pusta liste.
  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Graficy</h1>
        <div className="bg-red-400/10 border border-red-400/30 rounded-2xl p-6">
          <p className="font-semibold text-red-400 mb-2">
            Nie udało się pobrać listy grafików
          </p>
          <p className="text-sm text-brand-chrom mb-3">{error.message}</p>
          <p className="text-sm text-brand-chrom">
            Jeśli widzisz komunikat o nieistniejącej tabeli — uruchom migrację{" "}
            <code className="text-brand-lime">009_designers.sql</code> w SQL Editorze
            Supabase.
          </p>
        </div>
      </div>
    );
  }

  const list = designers || [];
  const aktywni = list.filter((d) => d.status === "active").length;
  const naSzablonach = list.filter((d) => d.works_on_vehicle_templates).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Graficy</h1>
        <span className="text-sm text-brand-chrom">
          {list.length} w bazie · {aktywni} aktywnych · {naSzablonach} na szablonach
        </span>
      </div>
      <p className="text-sm text-brand-chrom mb-8 max-w-2xl">
        Projektanci od oklejeń pojazdów. Większość studiów nie ma własnego grafika —
        to tu klient go znajduje. Do jednego briefu kierujemy maksymalnie trzech.
      </p>

      <AddDesignerForm />

      {/* Filtry */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <a
          href="/admin/graficy"
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            !params.status
              ? "bg-brand-lime/15 text-brand-lime"
              : "text-brand-chrom hover:text-brand-kosc hover:bg-white/5"
          }`}
        >
          Wszyscy
        </a>
        {Object.entries(statusLabels).map(([key, { label }]) => (
          <a
            key={key}
            href={`/admin/graficy?status=${key}`}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              params.status === key
                ? "bg-brand-lime/15 text-brand-lime"
                : "text-brand-chrom hover:text-brand-kosc hover:bg-white/5"
            }`}
          >
            {label}
          </a>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-10 text-center">
          <p className="text-brand-chrom">
            {params.status
              ? "Brak grafików w tym statusie."
              : "Nie ma jeszcze żadnego grafika. Dodaj pierwszego — bez nich brief klienta nie ma dokąd trafić."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((d) => {
            const profile = Array.isArray(d.profile) ? d.profile[0] : d.profile;
            const st = statusLabels[d.status] || {
              label: d.status,
              color: "bg-white/10 text-brand-chrom",
            };
            const widelki = priceRange(d.price_from, d.price_to);

            return (
              <div
                key={d.id}
                className="bg-brand-grafit-light border border-brand-border rounded-2xl p-5 flex items-start justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold">{d.display_name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>
                      {st.label}
                    </span>
                    {d.verified_at && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-teal-400/15 text-teal-400">
                        ✓ Zweryfikowany
                      </span>
                    )}
                    {d.works_on_vehicle_templates && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-brand-chrom">
                        szablony pojazdów
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-brand-chrom">
                    {[profile?.email, profile?.phone, d.city]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  {(d.specializations?.length || d.software?.length) && (
                    <p className="text-sm text-brand-chrom mt-1">
                      {[
                        d.specializations?.join(", "),
                        d.software?.join(", "),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}

                  {(widelki || d.monthly_capacity) && (
                    <p className="text-sm text-brand-chrom mt-1">
                      {[
                        widelki,
                        d.monthly_capacity
                          ? `${d.monthly_capacity} proj./mies.`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}

                  <div className="flex gap-3 mt-2 flex-wrap text-sm">
                    {d.portfolio_url && (
                      <a
                        href={d.portfolio_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-lime hover:underline"
                      >
                        Portfolio ↗
                      </a>
                    )}
                    {d.instagram && (
                      <a
                        href={`https://instagram.com/${d.instagram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-chrom hover:text-brand-kosc"
                      >
                        @{d.instagram}
                      </a>
                    )}
                    {d.website && (
                      <a
                        href={d.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-chrom hover:text-brand-kosc"
                      >
                        WWW ↗
                      </a>
                    )}
                  </div>

                  {d.rejection_reason && (
                    <p className="text-sm text-red-400 mt-2">
                      Powód odrzucenia: {d.rejection_reason}
                    </p>
                  )}
                </div>

                <DesignerActions
                  designerId={d.id}
                  currentStatus={d.status}
                  verifiedAt={d.verified_at}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
