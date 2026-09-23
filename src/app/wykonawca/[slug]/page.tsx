import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ReviewForm } from "./review-form";

// Publiczny profil wykonawcy: /wykonawca/{slug}
// Dostep anonimowy — RLS „Public can view active studios" puszcza status='active'.
// Dziala dla studia i dla wrappera mobilnego (provider_type='freelancer');
// dla wrappera akcent na dojazd i portfolio z Instagrama.

const SITE_URL = "https://zlecoklejanie.pl";

type StudioProfile = {
  id: string;
  business_name: string | null;
  slug: string | null;
  description: string | null;
  specializations: string[] | null;
  foil_brands: string[] | null;
  films_used: string[] | null;
  instagram: string | null;
  instagram_url: string | null;
  website: string | null;
  address: string | null;
  service_radius_km: number | null;
  years_experience: number | null;
  work_mode: string[] | null;
  provider_type: "studio" | "freelancer" | null;
  google_rating: number | null;
  google_reviews_count: number | null;
  portfolio: { url: string; path: string }[] | null;
};

const WORK_MODE_LABELS: Record<string, string> = {
  u_klienta: "Dojazd do klienta",
  garaz_wynajmowany: "Wynajmowany garaż",
  studio_partnerskie: "Studio partnerskie",
};

function instagramUrl(p: StudioProfile): string | null {
  const raw = (p.instagram_url || p.instagram || "").trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const handle = raw.replace(/^@/, "").replace(/\/+$/, "");
  return handle ? `https://instagram.com/${handle}` : null;
}

async function getProfile(slug: string): Promise<StudioProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("studios")
    .select(
      "id, business_name, slug, description, specializations, foil_brands, films_used, instagram, instagram_url, website, address, service_radius_km, years_experience, work_mode, provider_type, google_rating, google_reviews_count, portfolio"
    )
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  return (data as StudioProfile) ?? null;
}

type Review = {
  id: string;
  author_name: string | null;
  rating: number;
  comment: string | null;
  reply: string | null;
  created_at: string;
};

async function getReviews(studioId: string): Promise<Review[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("id, author_name, rating, comment, reply, created_at")
    .eq("studio_id", studioId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data as Review[]) ?? [];
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const p = await getProfile(params.slug);
  if (!p) return { title: "Wykonawca nie znaleziony | ZlecOklejanie.pl" };

  const name = p.business_name || "Wykonawca";
  const city = p.address || "";
  const isFreelancer = p.provider_type === "freelancer";
  const usluga = isFreelancer ? "oklejanie samochodów" : "studio oklejania i PPF";

  const title = city
    ? `${name} — ${usluga} ${city} | ZlecOklejanie.pl`
    : `${name} — ${usluga} | ZlecOklejanie.pl`;

  const desc =
    p.description?.slice(0, 155) ||
    `${name} — ${usluga}${city ? ` w ${city}` : ""}. Poproś o wycenę przez ZlecOklejanie.pl.`;

  return {
    title,
    description: desc,
    alternates: { canonical: `${SITE_URL}/wykonawca/${p.slug}` },
    openGraph: {
      title,
      description: desc,
      url: `${SITE_URL}/wykonawca/${p.slug}`,
      type: "profile",
    },
  };
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-brand-border bg-brand-grafit-light px-3 py-1 text-sm text-brand-kosc">
      {children}
    </span>
  );
}

export default async function WykonawcaProfilePage({
  params,
}: {
  params: { slug: string };
}) {
  const p = await getProfile(params.slug);
  if (!p) notFound();

  const reviews = await getReviews(p.id);
  const reviewsCount = reviews.length;
  const reviewsAvg = reviewsCount
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewsCount
    : 0;

  const name = p.business_name || "Wykonawca";
  const isFreelancer = p.provider_type === "freelancer";
  const ig = instagramUrl(p);
  const foils = (p.films_used?.length ? p.films_used : p.foil_brands) || [];
  const modes = (p.work_mode || []).map((m) => WORK_MODE_LABELS[m] || m);
  const quoteUrl = `${SITE_URL}/?wykonawca=${encodeURIComponent(p.slug || "")}#zlecenie`;

  return (
    <main className="min-h-screen bg-brand-grafit text-brand-kosc">
      <header className="border-b border-brand-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <a href={SITE_URL} className="text-lg font-bold">
            <span className="text-brand-lime">Zlec</span>Oklejanie.pl
          </a>
          <a
            href={quoteUrl}
            className="rounded-lg bg-brand-lime px-4 py-2 text-sm font-semibold text-brand-grafit hover:opacity-90"
          >
            Zleć wycenę
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-brand-lime px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-grafit">
            {isFreelancer ? "Wrapper mobilny" : "Studio"}
          </span>
          {reviewsCount > 0 ? (
            <span className="text-sm text-brand-chrom">
              ★ {reviewsAvg.toFixed(1)} ({reviewsCount}{" "}
              {reviewsCount === 1 ? "opinia" : "opinii"})
            </span>
          ) : typeof p.google_rating === "number" && p.google_rating > 0 ? (
            <span className="text-sm text-brand-chrom">
              ★ {p.google_rating.toFixed(1)}
              {p.google_reviews_count ? ` (${p.google_reviews_count} z Google)` : ""}
            </span>
          ) : null}
        </div>

        <h1 className="text-3xl font-bold sm:text-4xl">{name}</h1>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-brand-chrom">
          {p.address && (
            <span>
              {p.address}
              {isFreelancer && p.service_radius_km
                ? ` · dojazd do ${p.service_radius_km} km`
                : ""}
            </span>
          )}
          {!isFreelancer && p.service_radius_km ? (
            <span>Zasięg: {p.service_radius_km} km</span>
          ) : null}
          {p.years_experience ? (
            <span>Doświadczenie: {p.years_experience} lat</span>
          ) : null}
        </div>

        {p.description && (
          <p className="mt-6 whitespace-pre-line leading-relaxed">{p.description}</p>
        )}

        {p.specializations?.length ? (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-chrom">
              Co robi
            </h2>
            <div className="flex flex-wrap gap-2">
              {p.specializations.map((s) => (
                <Chip key={s}>{s}</Chip>
              ))}
            </div>
          </section>
        ) : null}

        {modes.length ? (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-chrom">
              Gdzie pracuje
            </h2>
            <div className="flex flex-wrap gap-2">
              {modes.map((m) => (
                <Chip key={m}>{m}</Chip>
              ))}
            </div>
          </section>
        ) : null}

        {foils.length ? (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-chrom">
              Folie, na których pracuje
            </h2>
            <div className="flex flex-wrap gap-2">
              {foils.map((f) => (
                <Chip key={f}>{f}</Chip>
              ))}
            </div>
          </section>
        ) : null}

        {Array.isArray(p.portfolio) && p.portfolio.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-chrom">
              Realizacje
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {p.portfolio.map((it) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={it.path}
                  src={it.url}
                  alt={`Realizacja \u2014 ${name}`}
                  loading="lazy"
                  className="h-40 w-full rounded-xl border border-brand-border object-cover"
                />
              ))}
            </div>
          </section>
        )}

        {ig && (
          <section className="mt-8 rounded-2xl border border-brand-border bg-brand-grafit-light p-6">
            <h2 className="text-lg font-semibold">Portfolio na Instagramie</h2>
            <p className="mt-1 text-sm text-brand-chrom">
              Realizacje {isFreelancer ? "tego wykonawcy" : "tego studia"} zobaczysz
              na żywo na Instagramie.
            </p>
            <a
              href={ig}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-brand-lime px-4 py-2 text-sm font-semibold text-brand-lime hover:bg-brand-lime hover:text-brand-grafit"
            >
              Zobacz portfolio na Instagramie →
            </a>
          </section>
        )}

        {/* Opinie */}
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-chrom">
            Opinie{reviewsCount ? ` (${reviewsCount})` : ""}
          </h2>
          {reviewsCount === 0 ? (
            <p className="text-sm text-brand-chrom">
              Ten wykonawca nie ma jeszcze opinii. Możesz być pierwszy.
            </p>
          ) : (
            <div className="space-y-4">
              {reviews.map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-brand-border bg-brand-grafit-light p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{r.author_name}</span>
                    <span className="text-brand-lime" aria-label={`${r.rating} z 5`}>
                      {"★".repeat(r.rating)}
                      <span className="text-brand-border">
                        {"★".repeat(5 - r.rating)}
                      </span>
                    </span>
                  </div>
                  {r.comment && (
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
                      {r.comment}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-brand-chrom">
                    {new Date(r.created_at).toLocaleDateString("pl-PL")}
                  </p>
                  {r.reply && (
                    <div className="mt-3 rounded-lg border-l-2 border-brand-lime bg-brand-grafit px-3 py-2">
                      <p className="text-xs font-semibold text-brand-lime mb-1">
                        Odpowiedź wykonawcy
                      </p>
                      <p className="whitespace-pre-line text-sm">{r.reply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <ReviewForm studioId={p.id} />
        </section>

        <section className="mt-10 rounded-2xl bg-brand-lime p-6 text-brand-grafit">
          <h2 className="text-xl font-bold">
            Chcesz wycenę {isFreelancer ? "od tego wrappera" : "od tego studia"}?
          </h2>
          <p className="mt-1 text-sm">
            Wypełnij krótki formularz — Twoje zapytanie trafi do wykonawcy. Bez opłat.
          </p>
          <a
            href={quoteUrl}
            className="mt-4 inline-block rounded-lg bg-brand-grafit px-5 py-3 font-semibold text-brand-kosc hover:opacity-90"
          >
            Zleć wycenę
          </a>
        </section>

        <footer className="mt-12 border-t border-brand-border pt-6 text-xs text-brand-chrom">
          <p>
            Profil w serwisie{" "}
            <a href={SITE_URL} className="underline">
              ZlecOklejanie.pl
            </a>
            . Wykonawca odpowiada samodzielnie za wycenę, realizację i rozliczenie
            usługi.{" "}
            <a href={`${SITE_URL}/regulamin.html`} className="underline">
              Regulamin
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
