import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { czyPustyProfil } from "@/lib/catalog";
import { linkiCennikow, miastoStudia, wMiescie } from "@/lib/miasta";
import { labelUslugi, oczyscUslugi } from "@/lib/uslugi";
import { ReviewForm } from "./review-form";
import { PublicFooterNote } from "@/components/ui/public-footer-note";

// Publiczny profil wykonawcy: /wykonawca/{slug}
// Dostep anonimowy — RLS „Public can view active studios" puszcza status='active'.
// Dziala dla studia i dla wrappera mobilnego (provider_type='freelancer');
// dla wrappera akcent na dojazd i portfolio z Instagrama.

const SITE_URL = "https://zlecoklejanie.pl";
const OG_IMAGE = `${SITE_URL}/img/og-image.png`;

type StudioProfile = {
  id: string;
  business_name: string | null;
  slug: string | null;
  description: string | null;
  services: string[] | null;
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
      "id, business_name, slug, description, services, specializations, foil_brands, films_used, instagram, instagram_url, website, address, service_radius_km, years_experience, work_mode, provider_type, google_rating, google_reviews_count, portfolio"
    )
    .eq("slug", slug)
    .eq("status", "active")
    .is("deleted_at", null)
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

/**
 * Data stanu oceny Google (kolumna google_rating_at, migracja 027). Osobne, odporne
 * zapytanie: gdyby migracja nie była jeszcze odpalona, profil ma się wyświetlić bez daty,
 * a nie zwrócić 404.
 */
async function getGoogleRatingDate(studioId: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("studios").select("google_rating_at").eq("id", studioId).maybeSingle();
    if (error) return null;
    const v = (data as { google_rating_at?: string | null } | null)?.google_rating_at;
    return v ? new Date(v).toLocaleDateString("pl-PL") : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const p = await getProfile(params.slug);
  if (!p) return { title: "Wykonawca nie znaleziony | ZlecOklejanie.pl" };

  const name = p.business_name || "Wykonawca";
  const city = miastoStudia(p.address)?.nazwa ?? null;
  const isFreelancer = p.provider_type === "freelancer";
  const usluga = isFreelancer ? "oklejanie samochodów" : "studio oklejania i PPF";

  // Tytuł do ok. 65 znaków: przy długiej nazwie firmy najpierw odpada sufiks portalu,
  // potem opis usługi (nazwa + miasto zostają zawsze).
  const warianty = [
    `${name} — ${usluga}${city ? `, ${city}` : ""} | ZlecOklejanie.pl`,
    `${name} — ${usluga}${city ? `, ${city}` : ""}`,
    city ? `${name} — ${city}` : name,
  ];
  const title = warianty.find((t) => t.length <= 65) ?? warianty[warianty.length - 1];

  // Opis: własny opis wykonawcy, jeśli jest sensownej długości; inaczej zdanie z usług i miasta.
  const uslugi = oczyscUslugi(p.services).map(labelUslugi);
  const wlasny = (p.description || "").replace(/\s+/g, " ").trim();
  const desc =
    wlasny.length >= 70
      ? wlasny.length > 155
        ? `${wlasny.slice(0, 152).trimEnd()}…`
        : wlasny
      : `${name} — ${usluga}${city ? ` ${wMiescie(city)}` : ""}.${
          uslugi.length ? ` Usługi: ${uslugi.slice(0, 4).join("; ")}.` : ""
        } Poproś o bezpłatną wycenę przez ZlecOklejanie.pl.`;

  const image = p.portfolio?.[0]?.url || OG_IMAGE;

  return {
    title,
    description: desc,
    alternates: { canonical: `${SITE_URL}/wykonawca/${p.slug}` },
    // Profil z samą nazwą i miastem nie idzie do indeksu, dopóki wykonawca go nie uzupełni.
    ...(czyPustyProfil(p) ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description: desc,
      url: `${SITE_URL}/wykonawca/${p.slug}`,
      type: "profile",
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description: desc, images: [image] },
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
  const googleRatingDate = await getGoogleRatingDate(p.id);
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
  const miasto = miastoStudia(p.address);
  const cenniki = miasto ? linkiCennikow(miasto.slug) : [];

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Wykonawcy", item: `${SITE_URL}/wykonawcy` },
      ...(miasto
        ? [{ "@type": "ListItem", position: 2, name: miasto.nazwa, item: `${SITE_URL}/wykonawcy/${miasto.slug}` }]
        : []),
      { "@type": "ListItem", position: miasto ? 3 : 2, name, item: `${SITE_URL}/wykonawca/${p.slug}` },
    ],
  };

  return (
    <main className="min-h-screen bg-brand-grafit text-brand-kosc">
      <header className="border-b border-brand-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <a href={SITE_URL} className="text-lg font-bold">
            <span className="text-brand-lime">Zlec</span>Oklejanie.pl
          </a>
          <a
            href={quoteUrl}
            data-track="profil_zlec_wycene"
            data-slug={p.slug ?? ""}
            className="rounded-lg bg-brand-lime px-4 py-2 text-sm font-semibold text-brand-grafit hover:opacity-90"
          >
            Zleć wycenę
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <nav className="mb-4 text-sm text-brand-chrom">
          <Link href="/wykonawcy" className="hover:text-brand-lime">Wykonawcy</Link>
          {miasto && (
            <>
              <span className="mx-2">/</span>
              <Link href={`/wykonawcy/${miasto.slug}`} className="hover:text-brand-lime">
                {miasto.nazwa}
              </Link>
            </>
          )}
          <span className="mx-2">/</span>
          <span className="text-brand-kosc">{name}</span>
        </nav>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-brand-lime px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-grafit">
            {isFreelancer ? "Wrapper mobilny" : "Studio"}
          </span>
          {reviewsCount > 0 ? (
            <span className="text-sm text-brand-chrom">
              ★ {reviewsAvg.toFixed(1)} ({reviewsCount}{" "}
              {reviewsCount === 1 ? "opinia" : "opinii"})
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

        {oczyscUslugi(p.services).length ? (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-chrom">
              Usługi
            </h2>
            <div className="flex flex-wrap gap-2">
              {oczyscUslugi(p.services).map((k) => (
                <Chip key={k}>{labelUslugi(k)}</Chip>
              ))}
            </div>
          </section>
        ) : null}

        {p.specializations?.length ? (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-chrom">
              {oczyscUslugi(p.services).length ? "Inne usługi" : "Co robi"}
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
              data-track="profil_kontakt"
              data-kind="instagram"
              data-slug={p.slug ?? ""}
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
          <p className="mb-4 text-xs leading-relaxed text-brand-chrom">
            Opinie dodają klienci. Nie sprawdzamy, czy autor skorzystał z usługi. Każdą opinię przed publikacją
            czyta administrator. Nie usuwamy opinii za to, że są negatywne.{" "}
            <a href={`${SITE_URL}/regulamin`} className="underline">
              Zasady w regulaminie
            </a>
            .
          </p>
          {typeof p.google_rating === "number" && p.google_rating > 0 ? (
            <p className="mb-4 rounded-lg border border-brand-border bg-brand-grafit-light px-3 py-2 text-sm text-brand-chrom">
              Ocena z Google: {p.google_rating.toFixed(1).replace(".", ",")}
              {p.google_reviews_count
                ? ` (${p.google_reviews_count} opinii${googleRatingDate ? `, stan na ${googleRatingDate}` : ""})`
                : ""}{" "}
              — nieweryfikowana przez nas.
            </p>
          ) : null}
          {reviewsCount === 0 ? (
            <p className="text-sm text-brand-chrom">
              Ten wykonawca nie ma jeszcze opinii z portalu. Możesz być pierwszy.
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

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-chrom">
            Ceny i inni wykonawcy
          </h2>
          <ul className="flex flex-wrap gap-2">
            {miasto && (
              <li>
                <Link
                  href={`/wykonawcy/${miasto.slug}`}
                  className="inline-block rounded-full border border-brand-border px-3 py-1 text-sm text-brand-kosc hover:border-brand-lime hover:text-brand-lime"
                >
                  Wykonawcy {wMiescie(miasto.nazwa)} i w okolicy
                </Link>
              </li>
            )}
            {cenniki.map((c) => (
              <li key={c.href}>
                <a
                  href={c.href}
                  className="inline-block rounded-full border border-brand-border px-3 py-1 text-sm text-brand-kosc hover:border-brand-lime hover:text-brand-lime"
                >
                  {c.label}
                </a>
              </li>
            ))}
            {cenniki.length === 0 && (
              <li>
                <a
                  href={`${SITE_URL}/blog/ceny-oklejania-2026`}
                  className="inline-block rounded-full border border-brand-border px-3 py-1 text-sm text-brand-kosc hover:border-brand-lime hover:text-brand-lime"
                >
                  Ile kosztuje oklejenie auta — poradnik
                </a>
              </li>
            )}
          </ul>
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
            data-track="profil_zlec_wycene"
            data-slug={p.slug ?? ""}
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
            <a href={`${SITE_URL}/regulamin`} className="underline">
              Regulamin
            </a>
          </p>
          <PublicFooterNote />
        </footer>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {/* Structured data — LocalBusiness */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": isFreelancer ? "AutoDetailing" : "AutoBodyShop",
            name,
            url: `${SITE_URL}/wykonawca/${p.slug}`,
            ...(miasto
              ? { address: { "@type": "PostalAddress", addressLocality: miasto.nazwa, addressCountry: "PL" } }
              : {}),
            ...(p.portfolio?.[0]?.url ? { image: p.portfolio[0].url } : {}),
            // Tylko opinie zebrane na portalu (od klientów, po moderacji). Oceny Google NIE trafiają
            // do danych strukturalnych — Google zabrania agregowania ocen z innych serwisów.
            ...(reviewsCount > 0
              ? {
                  aggregateRating: {
                    "@type": "AggregateRating",
                    ratingValue: Number(reviewsAvg.toFixed(1)),
                    reviewCount: reviewsCount,
                    bestRating: 5,
                    worstRating: 1,
                  },
                }
              : {}),
          }),
        }}
      />
    </main>
  );
}
