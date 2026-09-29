import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AddStudioForm } from "./add-studio-form";
import { FetchCoversButton } from "./fetch-covers-button";
import { StudioActions } from "./studio-actions";
import { RestoreStudioButton, StudioManage } from "./studio-manage";
import { SearchList } from "@/components/ui/search-list";
import { labelUslugi, maUslugeCore, oczyscUslugi } from "@/lib/uslugi";

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Oczekuje", color: "bg-amber-400/15 text-amber-400" },
  active: { label: "Aktywne", color: "bg-brand-lime/15 text-brand-lime" },
  suspended: { label: "Zawieszone", color: "bg-red-400/15 text-red-400" },
  rejected: { label: "Odrzucone", color: "bg-red-400/15 text-red-400" },
};

export default async function StudiaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; uslugi?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  // „Usunięte" = miękko usunięte (deleted_at ustawione) — osobna zakładka z „Przywróć"
  const showDeleted = params.status === "deleted";
  // „Bez usług” = brak usługi core (studios.services) — do uzupełnienia (Faza 5 briefu).
  const showNoServices = params.uslugi === "brak";

  let query = supabase
    .from("studios")
    .select(`
      id,
      business_name,
      nip,
      address,
      instagram,
      website,
      services,
      work_mode,
      specializations,
      foil_brands,
      google_rating,
      google_reviews_count,
      status,
      verified_at,
      rejection_reason,
      created_at,
      deleted_at,
      provider_type,
      profile:profiles!studios_id_fkey(email, full_name, phone)
    `)
    .order("created_at", { ascending: false });

  if (showDeleted) {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
    if (params.status) {
      query = query.eq("status", params.status);
    }
  }

  const { data: fetched } = await query;
  const studios = showNoServices
    ? (fetched || []).filter((s: any) => !maUslugeCore(s.services))
    : fetched;

  // Licznik do filtra — wszystkie nieusunięte, niezależnie od zakładki statusu.
  const { data: allServices } = await supabase
    .from("studios")
    .select("services")
    .is("deleted_at", null);
  const noServicesCount = (allServices || []).filter((s: any) => !maUslugeCore(s.services)).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Studia</h1>
        <div className="flex items-start gap-4">
          <FetchCoversButton />
          <span className="pt-2 text-sm text-brand-chrom">
            {studios?.length || 0} studiów
          </span>
        </div>
      </div>

      {/* Filtry */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <a
          href="/admin/studia"
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            !params.status && !showNoServices
              ? "bg-brand-lime/15 text-brand-lime"
              : "text-brand-chrom hover:text-brand-kosc hover:bg-white/5"
          }`}
        >
          Wszystkie
        </a>
        {Object.entries(statusLabels).map(([key, { label }]) => (
          <a
            key={key}
            href={`/admin/studia?status=${key}`}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              params.status === key
                ? "bg-brand-lime/15 text-brand-lime"
                : "text-brand-chrom hover:text-brand-kosc hover:bg-white/5"
            }`}
          >
            {label}
          </a>
        ))}
        <a
          href="/admin/studia?status=deleted"
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            showDeleted
              ? "bg-red-400/15 text-red-400"
              : "text-brand-chrom hover:text-brand-kosc hover:bg-white/5"
          }`}
        >
          Usunięte
        </a>
        <a
          href="/admin/studia?uslugi=brak"
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            showNoServices
              ? "bg-amber-400/15 text-amber-400"
              : "text-amber-400/80 hover:text-amber-400 hover:bg-white/5"
          }`}
        >
          ⚠ Bez usług ({noServicesCount})
        </a>
      </div>

      {/* Dodaj studio */}
      <AddStudioForm />

      {/* Lista studiów */}
      {!studios || studios.length === 0 ? (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-12 text-center">
          <p className="text-brand-chrom mb-2">
            {showDeleted ? "Brak usuniętych studiów" : "Brak studiów"}
          </p>
          {!showDeleted && (
            <p className="text-sm text-brand-chrom/60">
              Użyj formularza powyżej, żeby dodać pierwsze studio.
            </p>
          )}
        </div>
      ) : (
        <SearchList
          placeholder="Szukaj studia — nazwa, miasto, e-mail, telefon, NIP..."
          emptyText="Żadne studio nie pasuje do wyszukiwania."
          rows={studios.map((studio: any) => {
            const st = statusLabels[studio.status] || {
              label: studio.status,
              color: "bg-gray-400/15 text-gray-400",
            };
            const node = (
              <div
                key={studio.id}
                className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Link
                        href={`/admin/studia/${studio.id}`}
                        className="font-semibold text-brand-text hover:text-brand-lime transition-colors"
                      >
                        {studio.business_name || "Bez nazwy"}
                      </Link>
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}
                      >
                        {st.label}
                      </span>
                      {studio.verified_at && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium bg-teal-400/15 text-teal-400">
                          ✓ Zweryfikowane
                        </span>
                      )}
                      {studio.provider_type === "freelancer" && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium bg-purple-400/15 text-purple-400">
                          🚗 Wrapper
                        </span>
                      )}
                      {!studio.deleted_at && !maUslugeCore(studio.services) && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium bg-amber-400/15 text-amber-400">
                          ⚠ brak usług
                        </span>
                      )}
                      {studio.deleted_at && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-400/15 text-red-400">
                          Usunięte {new Date(studio.deleted_at).toLocaleDateString("pl-PL")}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-brand-chrom">
                      {studio.address && (
                        <p>📍 {studio.address}</p>
                      )}
                      {studio.instagram && (
                        <p>
                          📸{" "}
                          <a
                            href={`https://instagram.com/${studio.instagram}`}
                            target="_blank"
                            rel="noopener"
                            className="text-brand-lime hover:underline"
                          >
                            @{studio.instagram}
                          </a>
                        </p>
                      )}
                      {studio.profile?.email && (
                        <p>✉️ {studio.profile.email}</p>
                      )}
                      {studio.profile?.phone && (
                        <p>📞 {studio.profile.phone}</p>
                      )}
                      {studio.google_rating && (
                        <p>
                          ⭐ {studio.google_rating} ({studio.google_reviews_count}{" "}
                          opinii)
                        </p>
                      )}
                      {studio.nip && (
                        <p>NIP: {studio.nip}</p>
                      )}
                    </div>
                    {oczyscUslugi(studio.services).length > 0 && (
                      <div className="flex gap-2 mt-3 flex-wrap">
                        {oczyscUslugi(studio.services).map((s) => (
                          <span
                            key={s}
                            className="text-xs px-2 py-0.5 rounded bg-brand-lime/10 text-brand-lime"
                          >
                            {labelUslugi(s)}
                          </span>
                        ))}
                      </div>
                    )}
                    {studio.specializations &&
                      studio.specializations.length > 0 && (
                        <p className="mt-2 text-xs text-brand-chrom/70">
                          Inne (opis): {studio.specializations.join(", ")}
                        </p>
                      )}
                    {studio.rejection_reason && (
                      <p className="mt-2 text-sm text-red-400">
                        Powód odrzucenia: {studio.rejection_reason}
                      </p>
                    )}
                  </div>
                  {studio.deleted_at ? (
                    <RestoreStudioButton studioId={studio.id} />
                  ) : (
                    <StudioActions
                      studioId={studio.id}
                      currentStatus={studio.status}
                      verifiedAt={studio.verified_at}
                    >
                      <StudioManage
                        studio={{
                          id: studio.id,
                          business_name: studio.business_name,
                          address: studio.address,
                          instagram: studio.instagram,
                          services: studio.services,
                          work_mode: studio.work_mode,
                          specializations: studio.specializations,
                          status: studio.status,
                          email: studio.profile?.email ?? null,
                          phone: studio.profile?.phone ?? null,
                        }}
                      />
                    </StudioActions>
                  )}
                </div>
              </div>
            );
            return {
              key: studio.id,
              text: [
                studio.business_name,
                studio.address,
                studio.profile?.email,
                studio.profile?.phone,
                studio.nip,
                studio.instagram,
                st.label,
                ...oczyscUslugi(studio.services).map(labelUslugi),
                maUslugeCore(studio.services) ? "" : "brak usług",
                ...(studio.specializations || []),
                ...(studio.foil_brands || []),
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
