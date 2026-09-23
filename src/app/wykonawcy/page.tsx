import type { Metadata } from "next";
import Link from "next/link";
import { StudioCard } from "@/components/ui/studio-card";
import { WykonawcyFilters } from "@/components/ui/wykonawcy-filters";
import {
  getCatalogStudios,
  filterStudios,
  sortStudios,
  cityIndex,
  serviceIndex,
} from "@/lib/catalog";

export const revalidate = 3600; // ISR: odśwież katalog co godzinę

const SITE_URL = "https://zlecoklejanie.pl";

export const metadata: Metadata = {
  title: "Katalog wykonawców — oklejanie aut, PPF, branding | ZlecOklejanie.pl",
  description:
    "Przeglądaj studia oklejania i wrapperów mobilnych z całej Polski. Zobacz realizacje, opinie i usługi, potem poproś o wycenę — bezpłatnie.",
  alternates: { canonical: `${SITE_URL}/wykonawcy` },
  openGraph: {
    title: "Katalog wykonawców oklejania | ZlecOklejanie.pl",
    description:
      "Studia oklejania i wrapperzy mobilni z całej Polski — realizacje, opinie, usługi.",
    url: `${SITE_URL}/wykonawcy`,
    type: "website",
  },
};

export default async function KatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const all = await getCatalogStudios();
  const miasta = cityIndex(all);
  const uslugi = serviceIndex(all);

  const filtered = sortStudios(
    filterStudios(all, {
      q: sp.q,
      miasto: sp.miasto,
      usluga: sp.usluga,
      typ: sp.typ,
    })
  );

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Wykonawcy oklejania pojazdów — ZlecOklejanie.pl",
    numberOfItems: filtered.length,
    itemListElement: filtered.slice(0, 30).map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/wykonawca/${s.slug}`,
      name: s.business_name ?? "Wykonawca",
    })),
  };

  return (
    <main className="min-h-screen bg-brand-grafit text-brand-kosc">
      <header className="border-b border-brand-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href={SITE_URL} className="text-lg font-bold">
            <span className="text-brand-lime">Zlec</span>Oklejanie.pl
          </a>
          <a
            href={`${SITE_URL}/#zlecenie`}
            className="rounded-lg bg-brand-lime px-4 py-2 text-sm font-semibold text-brand-grafit hover:opacity-90"
          >
            Zleć wycenę
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-bold sm:text-4xl">Katalog wykonawców</h1>
        <p className="mt-2 max-w-2xl text-brand-chrom">
          Studia oklejania i wrapperzy mobilni z całej Polski. Zobacz realizacje i
          opinie, a potem poproś o wycenę — bezpłatnie i bez prowizji.
        </p>

        {miasta.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {miasta.slice(0, 12).map((m) => (
              <Link
                key={m.slug}
                href={`/wykonawcy/${m.slug}`}
                className="rounded-full border border-brand-border px-3 py-1 text-sm text-brand-chrom hover:border-brand-lime hover:text-brand-lime"
              >
                {m.name} ({m.count})
              </Link>
            ))}
          </div>
        )}

        <div className="mt-6">
          <WykonawcyFilters
            miasta={miasta.map((m) => m.slug)}
            uslugi={uslugi}
          />
        </div>

        <p className="mt-4 text-sm text-brand-chrom">
          {filtered.length}{" "}
          {filtered.length === 1
            ? "wykonawca"
            : filtered.length >= 2 && filtered.length <= 4
            ? "wykonawców"
            : "wykonawców"}
        </p>

        {filtered.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-brand-border bg-brand-grafit-light p-8 text-center">
            <p className="text-brand-chrom">
              Brak wykonawców dla wybranych filtrów. Zmień kryteria albo{" "}
              <a href={`${SITE_URL}/#zlecenie`} className="text-brand-lime underline">
                opisz zlecenie
              </a>{" "}
              — znajdziemy pasującego partnera.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <StudioCard key={s.id} s={s} />
            ))}
          </div>
        )}
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />
    </main>
  );
}
