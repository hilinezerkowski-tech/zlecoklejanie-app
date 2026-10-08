import type { Metadata } from "next";
import Link from "next/link";
import { StudioCard } from "@/components/ui/studio-card";
import { PublicFooterNote } from "@/components/ui/public-footer-note";
import { WykonawcyFilters } from "@/components/ui/wykonawcy-filters";
import {
  getCatalogStudios,
  filterStudios,
  sortStudios,
  cityIndex,
  serviceIndex,
} from "@/lib/catalog";
import { listItemLd, stronyMiast } from "@/lib/catalog-geo";

export const revalidate = 3600; // ISR: odśwież katalog co godzinę

const SITE_URL = "https://zlecoklejanie.pl";
const OG_IMAGE = `${SITE_URL}/img/og-image.png`;

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
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
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
  // Wszystkie strony miast (także duże miasta bez własnego wykonawcy, ale z wykonawcami w okolicy).
  const strony = stronyMiast(all);

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
    itemListElement: filtered.map((s, i) => listItemLd(s, i + 1, SITE_URL)),
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

        <section className="mt-12">
          <h2 className="text-xl font-bold">Wykonawcy według miasta</h2>
          <p className="mt-1 max-w-2xl text-sm text-brand-chrom">
            Każda strona miasta pokazuje wykonawców z tej miejscowości i z promienia 50 km.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {strony.map((m) => (
              <Link
                key={m.slug}
                href={`/wykonawcy/${m.slug}`}
                className="rounded-full border border-brand-border px-3 py-1 text-sm text-brand-chrom hover:border-brand-lime hover:text-brand-lime"
              >
                {m.name}
                {m.lokalne.length > 0 ? ` (${m.lokalne.length})` : " (okolice)"}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold">Ile kosztuje oklejenie auta?</h2>
          <p className="mt-1 max-w-2xl text-sm text-brand-chrom">
            Zanim poprosisz o wycenę, sprawdź orientacyjne widełki:{" "}
            <a href={`${SITE_URL}/uslugi/`} className="text-brand-lime underline">
              cenniki oklejania, folii PPF i brandingu flot w 10 miastach
            </a>
            , poradnik{" "}
            <a href={`${SITE_URL}/blog/ceny-oklejania-2026`} className="text-brand-lime underline">
              ile kosztuje oklejenie auta
            </a>{" "}
            oraz porównanie{" "}
            <a href={`${SITE_URL}/blog/ppf-czy-powloka-ceramiczna`} className="text-brand-lime underline">
              PPF czy powłoka ceramiczna
            </a>
            .
          </p>
        </section>

        <div className="mt-10 border-t border-brand-border pt-4">
          <p className="text-xs text-brand-chrom">
            Opinie przy profilach dodają klienci portalu. Oceny z Google pokazujemy osobno i nie weryfikujemy ich.
          </p>
          <PublicFooterNote />
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />
    </main>
  );
}
