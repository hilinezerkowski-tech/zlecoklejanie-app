import Link from "next/link";
import { cityFromAddress } from "@/lib/studio-location";

export type StudioCardData = {
  slug: string | null;
  business_name: string | null;
  description: string | null;
  address: string | null;
  specializations: string[] | null;
  provider_type: "studio" | "freelancer" | null;
  portfolio: { url: string; path: string }[] | null;
  google_rating: number | null;
  google_reviews_count: number | null;
  reviewAvg?: number | null;
  reviewCount?: number | null;
};

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="text-brand-lime" aria-label={`Ocena ${value.toFixed(1)} na 5`}>
      {"★".repeat(full)}
      <span className="text-brand-border">{"★".repeat(5 - full)}</span>
    </span>
  );
}

export function StudioCard({ s }: { s: StudioCardData }) {
  if (!s.slug) return null;
  const city = cityFromAddress(s.address);
  const isFreelancer = s.provider_type === "freelancer";
  const cover = s.portfolio?.[0]?.url || null;
  const specs = (s.specializations || []).slice(0, 3);

  // Ocena: preferuj opinie z portalu, potem Google
  const rating =
    s.reviewCount && s.reviewCount > 0
      ? { avg: s.reviewAvg as number, count: s.reviewCount, src: "opinii" }
      : s.google_reviews_count && s.google_reviews_count > 0
      ? { avg: s.google_rating as number, count: s.google_reviews_count, src: "Google" }
      : null;

  return (
    <Link
      href={`/wykonawca/${s.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-brand-border bg-brand-grafit-light transition hover:border-brand-lime/60"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-brand-grafit">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={`Realizacja — ${s.business_name ?? "wykonawca"}`}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-brand-border">
            <span className="text-4xl font-black opacity-40">
              {(s.business_name || "?").charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-brand-grafit/85 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-lime backdrop-blur">
          {isFreelancer ? "Wrapper mobilny" : "Studio"}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold leading-tight text-brand-kosc group-hover:text-brand-lime">
            {s.business_name || "Wykonawca"}
          </h3>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-brand-chrom">
          {city && <span>📍 {city}</span>}
          {rating && (
            <span className="inline-flex items-center gap-1">
              <Stars value={rating.avg} />
              <span className="text-xs">
                {rating.avg.toFixed(1)} ({rating.count} {rating.src})
              </span>
            </span>
          )}
        </div>

        {specs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {specs.map((sp) => (
              <span
                key={sp}
                className="rounded-full border border-brand-border px-2 py-0.5 text-xs text-brand-chrom"
              >
                {sp}
              </span>
            ))}
          </div>
        )}

        <span className="mt-4 inline-block text-sm font-semibold text-brand-lime">
          Zobacz profil →
        </span>
      </div>
    </Link>
  );
}
