import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StudioCard } from "@/components/ui/studio-card";
import { WykonawcyFilters } from "@/components/ui/wykonawcy-filters";
import {
  getCatalogStudios,
  filterStudios,
  sortStudios,
  cityIndex,
  serviceIndex,
} from "@/lib/catalog";

export const revalidate = 3600;
const SITE_URL = "https://zlecoklejanie.pl";

export async function generateStaticParams() {
  const all = await getCatalogStudios();
  return cityIndex(all).map((c) => ({ miasto: c.slug }));
}

async function getCity(slug: string) {
  const all = await getCatalogStudios();
  const city = cityIndex(all).find((c) => c.slug === slug);
  return { all, city };
}

export async function generateMetadata({
  params,
}: {
  params: { miasto: string };
}): Promise<Metadata> {
  const { city } = await getCity(params.miasto);
  if (!city) return { title: "Miasto nie znalezione | ZlecOklejanie.pl" };
  const title = `Oklejanie aut, PPF i branding — ${city.name} | ZlecOklejanie.pl`;
  const desc = `Wykonawcy oklejania pojazdów w ${city.name} (${city.count}). Zobacz realizacje i opinie, poproś o bezpłatną wycenę na ZlecOklejanie.pl.`;
  return {
    title,
    description: desc,
    alternates: { canonical: `${SITE_URL}/wykonawcy/${city.slug}` },
    openGraph: { title, description: desc, url: `${SITE_URL}/wykonawcy/${city.slug}`, type: "website" },
  };
}

export default async function MiastoPage({
  params,
  searchParams,
}: {
  params: { miasto: string };
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { all, city } = await getCity(params.miasto);
  if (!city) notFound();

  const inCity = all.filter((s) => s.citySlugValue === city.slug);
  const uslugi = serviceIndex(inCity);
  const filtered = sortStudios(
    filterStudios(inCity, { q: sp.q, usluga: sp.usluga, typ: sp.typ })
  );

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Wykonawcy", item: `${SITE_URL}/wykonawcy` },
      { "@type": "ListItem", position: 2, name: city.name, item: `${SITE_URL}/wykonawcy/${city.slug}` },
    ],
  };

  return (
    <main className="min-h-screen bg-brand-grafit text-brand-kosc">
      <header className="border-b border-brand-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href={SITE_URL} className="text-lg font-bold">
            <span className="text-brand-lime">Zlec</span>Oklejanie.pl
          </a>
          <a href={`${SITE_URL}/#zlecenie`} className="rounded-lg bg-brand-lime px-4 py-2 text-sm font-semibold text-brand-grafit hover:opacity-90">
            Zleć wycenę
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <nav className="mb-4 text-sm text-brand-chrom">
          <Link href="/wykonawcy" className="hover:text-brand-lime">Wykonawcy</Link>
          <span className="mx-2">/</span>
          <span className="text-brand-kosc">{city.name}</span>
        </nav>

        <h1 className="text-3xl font-bold sm:text-4xl">
          Oklejanie aut, PPF i branding — {city.name}
        </h1>
        <p className="mt-2 max-w-2xl text-brand-chrom">
          {city.count === 1
            ? `Wykonawca oklejania pojazdów w ${city.name}.`
            : `${city.count} wykonawców oklejania pojazdów w ${city.name}.`}{" "}
          Zobacz realizacje i opinie, a potem poproś o bezpłatną wycenę. Bez prowizji.
        </p>

        <div className="mt-6">
          <WykonawcyFilters miasta={[]} uslugi={uslugi} hideCity />
        </div>

        {filtered.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-brand-border bg-brand-grafit-light p-8 text-center">
            <p className="text-brand-chrom">
              Brak wykonawców dla wybranych filtrów w {city.name}.{" "}
              <Link href="/wykonawcy" className="text-brand-lime underline">
                Zobacz cały katalog
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <StudioCard key={s.id} s={s} />
            ))}
          </div>
        )}

        <section className="mt-12 rounded-2xl bg-brand-lime p-6 text-brand-grafit">
          <h2 className="text-xl font-bold">Nie wiesz, kogo wybrać w {city.name}?</h2>
          <p className="mt-1 text-sm">
            Opisz auto i zakres — Twoje zapytanie trafi do pasujących wykonawców. Bez opłat.
          </p>
          <a href={`${SITE_URL}/#zlecenie`} className="mt-4 inline-block rounded-lg bg-brand-grafit px-5 py-3 font-semibold text-brand-kosc hover:opacity-90">
            Zleć wycenę
          </a>
        </section>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
    </main>
  );
}
