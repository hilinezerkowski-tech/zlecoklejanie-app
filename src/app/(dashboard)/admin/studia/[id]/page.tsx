import Link from "next/link";
import { notFound } from "next/navigation";
import { StudioActions } from "../studio-actions";
import { RestoreStudioButton, StudioManage } from "../studio-manage";
import { getStudioDetail } from "./actions";

export const dynamic = "force-dynamic";

const statusMeta: Record<string, { label: string; cls: string }> = {
  pending: { label: "Oczekuje", cls: "bg-amber-400/15 text-amber-400" },
  active: { label: "Aktywne", cls: "bg-brand-lime/15 text-brand-lime" },
  suspended: { label: "Zawieszone", cls: "bg-red-400/15 text-red-400" },
  rejected: { label: "Odrzucone", cls: "bg-red-400/15 text-red-400" },
};

const orderStatusMeta: Record<string, { label: string; cls: string }> = {
  new: { label: "Nowe", cls: "bg-sky-400/15 text-sky-400" },
  assigned: { label: "Przypisane", cls: "bg-amber-400/15 text-amber-400" },
  quoted: { label: "Wycenione", cls: "bg-brand-lime/15 text-brand-lime" },
  chosen: { label: "Wybrane", cls: "bg-violet-400/15 text-violet-400" },
  completed: { label: "Ukończone", cls: "bg-emerald-400/15 text-emerald-400" },
  cancelled: { label: "Anulowane", cls: "bg-red-400/15 text-red-400" },
};

const serviceLabels: Record<string, string> = {
  oklejanie: "Oklejanie",
  ppf: "PPF",
  branding: "Branding",
  grafika: "Grafika",
  inne: "Inne",
};

function Badge({ children, cls }: { children: React.ReactNode; cls: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-brand-chrom uppercase tracking-wide mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-brand-chrom w-28 shrink-0">{label}</span>
      <span className="text-brand-kosc break-all">{value}</span>
    </div>
  );
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL");
}

export default async function StudioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getStudioDetail(id);
  if (!detail) notFound();

  const { studio, assignments, quotes, emailLog } = detail;
  const profile = studio.profile as {
    id: string;
    email: string;
    full_name: string | null;
    phone: string | null;
    city: string | null;
  } | null;

  const st = statusMeta[studio.status] ?? { label: studio.status, cls: "bg-white/10 text-brand-chrom" };

  const managedStudio = {
    id: studio.id,
    business_name: studio.business_name,
    address: studio.address,
    instagram: studio.instagram,
    specializations: studio.specializations,
    status: studio.status,
    email: profile?.email ?? null,
    phone: profile?.phone ?? null,
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-brand-chrom">
        <Link
          href="/admin/studia"
          className="hover:text-brand-text transition-colors"
        >
          ← Studia
        </Link>
        <span className="text-brand-border">/</span>
        <span className="text-brand-text font-medium">
          {studio.business_name ?? "Bez nazwy"}
        </span>
      </div>

      {/* Header */}
      <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-brand-text">
                {studio.business_name ?? "Bez nazwy"}
              </h1>
              <Badge cls={st.cls}>{st.label}</Badge>
              {studio.verified_at && (
                <Badge cls="bg-brand-lime/20 text-brand-lime">
                  ✓ Zweryfikowane
                </Badge>
              )}
              {studio.deleted_at && (
                <Badge cls="bg-red-400/15 text-red-400">Usunięte</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-chrom">
              {profile?.city && <span>📍 {profile.city}</span>}
              {studio.nip && <span>NIP: {studio.nip}</span>}
              <span>Dołączyło: {fmt(studio.created_at)}</span>
              {studio.google_rating ? (
                <span>⭐ {studio.google_rating} ({studio.google_reviews_count} opinii)</span>
              ) : null}
            </div>
          </div>

          {/* Akcje */}
          <div className="shrink-0">
            {studio.deleted_at ? (
              <RestoreStudioButton studioId={studio.id} />
            ) : (
              <StudioActions
                studioId={studio.id}
                currentStatus={studio.status}
                verifiedAt={studio.verified_at}
              >
                <StudioManage studio={managedStudio} />
              </StudioActions>
            )}
          </div>
        </div>

        {studio.rejection_reason && (
          <p className="mt-3 text-sm text-red-400">
            Powód odrzucenia: {studio.rejection_reason}
          </p>
        )}
      </div>

      {/* Dwie kolumny: kontakt + oferta */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Dane kontaktowe">
          <div className="space-y-2">
            <Row label="E-mail" value={profile?.email} />
            <Row label="Telefon" value={profile?.phone} />
            <Row label="Imię / firma" value={profile?.full_name} />
            <Row label="Adres" value={studio.address} />
            <Row
              label="Instagram"
              value={
                studio.instagram ? (
                  <a
                    href={`https://instagram.com/${studio.instagram.replace("@", "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-lime hover:underline"
                  >
                    {studio.instagram}
                  </a>
                ) : null
              }
            />
            <Row
              label="Strona www"
              value={
                studio.website ? (
                  <a
                    href={studio.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-lime hover:underline"
                  >
                    {studio.website}
                  </a>
                ) : null
              }
            />
          </div>
        </Card>

        <Card title="Oferta i zakres">
          <div className="space-y-3">
            {studio.specializations?.length > 0 && (
              <div>
                <p className="text-xs text-brand-chrom mb-1">Specjalizacje</p>
                <div className="flex flex-wrap gap-1.5">
                  {studio.specializations.map((s: string) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 rounded-full text-xs bg-brand-lime/10 text-brand-lime"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {studio.foil_brands?.length > 0 && (
              <div>
                <p className="text-xs text-brand-chrom mb-1">Marki folii</p>
                <div className="flex flex-wrap gap-1.5">
                  {studio.foil_brands.map((b: string) => (
                    <span
                      key={b}
                      className="px-2 py-0.5 rounded-full text-xs bg-white/10 text-brand-kosc"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {studio.service_radius_km > 0 && (
              <Row label="Zasięg" value={`${studio.service_radius_km} km`} />
            )}
            {studio.description && (
              <div>
                <p className="text-xs text-brand-chrom mb-1">Opis</p>
                <p className="text-sm text-brand-kosc">{studio.description}</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Przypisane zlecenia */}
      <Card title={`Przypisane zlecenia (${assignments.length})`}>
        {assignments.length === 0 ? (
          <p className="text-sm text-brand-chrom">Brak przypisanych zleceń.</p>
        ) : (
          <div className="divide-y divide-brand-border">
            {assignments.map((a: {
              id: string;
              status: string;
              assigned_at: string | null;
              order: {
                id: string;
                service_type: string;
                scope: string;
                city: string;
                car_brand: string | null;
                car_model: string | null;
                car_year: number | null;
                status: string;
                created_at: string;
              } | null;
            }) => {
              const ord = a.order;
              if (!ord) return null;
              const oSt = orderStatusMeta[ord.status] ?? { label: ord.status, cls: "bg-white/10 text-brand-chrom" };
              return (
                <div key={a.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm">
                      <Link
                        href={`/admin/zlecenia/${ord.id}`}
                        className="font-medium text-brand-text hover:text-brand-lime transition-colors"
                      >
                        #{ord.id.slice(0, 8)}
                      </Link>
                      <span className="text-brand-chrom">·</span>
                      <span className="text-brand-chrom">
                        {serviceLabels[ord.service_type] ?? ord.service_type}
                      </span>
                      {ord.car_brand && (
                        <>
                          <span className="text-brand-chrom">·</span>
                          <span className="text-brand-chrom">
                            {ord.car_brand} {ord.car_model} {ord.car_year}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-brand-chrom mt-0.5">
                      📍 {ord.city} · Przypisano: {fmt(a.assigned_at)}
                    </div>
                  </div>
                  <Badge cls={oSt.cls}>{oSt.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Wyceny */}
      <Card title={`Złożone wyceny (${quotes.length})`}>
        {quotes.length === 0 ? (
          <p className="text-sm text-brand-chrom">Brak wycen.</p>
        ) : (
          <div className="divide-y divide-brand-border">
            {quotes.map((q: {
              id: string;
              price_min: number;
              price_max: number | null;
              comment: string | null;
              estimated_days: number | null;
              status: string;
              created_at: string;
              order: {
                id: string;
                city: string;
                car_brand: string | null;
                car_model: string | null;
                service_type: string;
              } | null;
            }) => {
              const ord = q.order;
              return (
                <div key={q.id} className="py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-sm">
                        {ord && (
                          <Link
                            href={`/admin/zlecenia/${ord.id}`}
                            className="font-medium text-brand-text hover:text-brand-lime transition-colors"
                          >
                            #{ord.id.slice(0, 8)}
                          </Link>
                        )}
                        {ord?.car_brand && (
                          <span className="text-brand-chrom">
                            · {ord.car_brand} {ord.car_model}
                          </span>
                        )}
                        {ord?.city && (
                          <span className="text-brand-chrom">· 📍 {ord.city}</span>
                        )}
                      </div>
                      <div className="text-xs text-brand-chrom mt-0.5">
                        {fmt(q.created_at)}
                        {q.estimated_days ? ` · czas: ${q.estimated_days} dni` : ""}
                      </div>
                      {q.comment && (
                        <p className="text-xs text-brand-kosc mt-1 italic">
                          &ldquo;{q.comment}&rdquo;
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold text-sm text-brand-lime">
                        {q.price_min.toLocaleString("pl-PL")}
                        {q.price_max ? `–${q.price_max.toLocaleString("pl-PL")}` : ""}
                        {" zł"}
                      </div>
                      <div className="text-xs text-brand-chrom">{q.status}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Historia maili */}
      <Card title={`Historia e-maili (${emailLog.length})`}>
        {emailLog.length === 0 ? (
          <p className="text-sm text-brand-chrom">Brak historii wysyłki.</p>
        ) : (
          <div className="divide-y divide-brand-border">
            {emailLog.map((log, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-2.5">
                <div>
                  <p className="text-sm text-brand-text">{log.subject}</p>
                  <p className="text-xs text-brand-chrom">{log.event} · {fmt(log.created_at)}</p>
                </div>
                <Badge
                  cls={
                    log.status === "sent"
                      ? "bg-brand-lime/15 text-brand-lime"
                      : "bg-red-400/15 text-red-400"
                  }
                >
                  {log.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
