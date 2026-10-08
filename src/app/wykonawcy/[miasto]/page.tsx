import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StudioCard } from "@/components/ui/studio-card";
import { PublicFooterNote } from "@/components/ui/public-footer-note";
import { WykonawcyFilters } from "@/components/ui/wykonawcy-filters";
import { getCatalogStudios, filterStudios, sortStudios, serviceIndex } from "@/lib/catalog";
import { PROMIEN_KM, listItemLd, stronyMiast } from "@/lib/catalog-geo";
import { linkiCennikow, wMiescie } from "@/lib/miasta";

export const revalidate = 3600;
const SITE_URL = "https://zlecoklejanie.pl";
const OG_IMAGE = `${SITE_URL}/img/og-image.png`;

export async function generateStaticParams() {
  const all = await getCatalogStudios();
  return stronyMiast(all).map((c) => ({ miasto: c.slug }));
}

async function getCity(slug: string) {
  const all = await getCatalogStudios();
  const strony = stronyMiast(all);
  return { strony, city: strony.find((c) => c.slug === slug) ?? null };
}

// „1 wykonawca", „4 wykonawców"
function ilu(n: number): string {
  return n === 1 ? "1 wykonawca" : `${n} wykonawców`;
}

export async function generateMetadata({
  params,
}: {
  params: { miasto: string };
}): Promise<Metadata> {
  const { city } = await getCity(params.miasto);
  if (!city) return { title: "Miasto nie znalezione | ZlecOklejanie.pl" };

  const pelny = `Studia oklejania aut i PPF ${city.name} — lista wykonawców | ZlecOklejanie.pl`;
  const title = pelny.length <= 65 ? pelny : `Studia oklejania aut i PPF ${city.name} — lista wykonawców`;
  const desc = `Studia oklejania, folii PPF i brandingu ${wMiescie(city.name)} oraz w promieniu ${PROMIEN_KM} km. Sprawdź usługi i opinie, poproś o bezpłatną wycenę — bez prowizji.`;
  const url = `${SITE_URL}/wykonawcy/${city.slug}`;
  return {
    title,
    description: desc,
    alternates: { canonical: url },
    // Strona bez żadnego uzupełnionego profilu nie idzie do indeksu (linki dalej działają).
    ...(city.indexable ? {} : { robots: { index: false, follow: true } }),
    openGraph: { title, description: desc, url, type: "website", images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description: desc, images: [OG_IMAGE] },
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
  const { strony, city } = await getCity(params.miasto);
  if (!city) notFound();

  const w = wMiescie(city.name);
  const inCity = city.lokalne;
  const uslugi = serviceIndex(inCity);
  const filtered = sortStudios(
    filterStudios(inCity, { q: sp.q, usluga: sp.usluga, typ: sp.typ })
  );
  const dostepne = uslugi.filter((u) => u.count > 0).map((u) => u.label);
  const cenniki = city.cennik ? linkiCennikow(city.cennik.slug) : [];
  const inneMiasta = strony.filter((c) => c.slug !== city.slug && c.lokalne.length > 0).slice(0, 12);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Wykonawcy", item: `${SITE_URL}/wykonawcy` },
      { "@type": "ListItem", position: 2, name: city.name, item: `${SITE_URL}/wykonawcy/${city.slug}` },
    ],
  };

  // Lista firm z tej strony (lokalni + w promieniu) — każda pozycja linkuje do profilu w tej samej domenie.
  const naLiscie = [...sortStudios(inCity), ...city.blisko];
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Wykonawcy oklejania pojazdów — ${city.name}`,
    numberOfItems: naLiscie.length,
    itemListElement: naLiscie.map((s, i) => listItemLd(s, i + 1, SITE_URL)),
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
          Studia oklejania aut i PPF — {city.name}
        </h1>
        <p className="mt-2 max-w-2xl text-brand-chrom">
          {inCity.length > 0
            ? `Na liście: ${ilu(inCity.length)} ${w}.`
            : `${w.charAt(0).toUpperCase() + w.slice(1)} nie mamy jeszcze wykonawcy na liście — poniżej najbliżsi z okolicy.`}{" "}
          {dostepne.length > 0 ? `Dostępne usługi: ${dostepne.join("; ")}. ` : ""}
          Zobacz profile i opinie, a potem poproś o bezpłatną wycenę. Bez prowizji.
        </p>

        {inCity.length > 0 && (
          <>
            <div className="mt-6">
              <WykonawcyFilters miasta={[]} uslugi={uslugi} hideCity />
            </div>

            {filtered.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-brand-border bg-brand-grafit-light p-8 text-center">
                <p className="text-brand-chrom">
                  Brak wykonawców dla wybranych filtrów {w}.{" "}
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
          </>
        )}

        {city.blisko.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-bold">W promieniu {PROMIEN_KM} km</h2>
            <p className="mt-1 max-w-2xl text-sm text-brand-chrom">
              Wykonawcy z sąsiednich miejscowości, od najbliższego. Odległość liczona w linii
              prostej od centrum — dojazd może być dłuższy.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {city.blisko.map((s) => (
                <StudioCard key={s.id} s={s} km={s.km} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-12">
          <h2 className="text-xl font-bold">Ile to kosztuje {w}?</h2>
          {cenniki.length > 0 && city.cennik ? (
            <>
              <p className="mt-1 max-w-2xl text-sm text-brand-chrom">
                {city.cennik.km === 0
                  ? "Widełki cen dla tego miasta, z podziałem na typ auta i zakres prac:"
                  : `Najbliższe miasto z cennikiem to ${city.cennik.name} (ok. ${city.cennik.km} km). Widełki z podziałem na typ auta i zakres prac:`}
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
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
              </ul>
            </>
          ) : (
            <p className="mt-1 max-w-2xl text-sm text-brand-chrom">
              Orientacyjne widełki dla całej Polski znajdziesz w{" "}
              <a href={`${SITE_URL}/uslugi/`} className="text-brand-lime underline">
                cennikach usług
              </a>{" "}
              i w poradniku{" "}
              <a href={`${SITE_URL}/blog/ceny-oklejania-2026`} className="text-brand-lime underline">
                ile kosztuje oklejenie auta
              </a>
              . Dokładną kwotę poda wykonawca po obejrzeniu auta.
            </p>
          )}
        </section>

        <section className="mt-12 rounded-2xl bg-brand-lime p-6 text-brand-grafit">
          <h2 className="text-xl font-bold">Nie wiesz, kogo wybrać {w}?</h2>
          <p className="mt-1 text-sm">
            Opisz auto i zakres — Twoje zapytanie trafi do pasujących wykonawców. Bez opłat.
          </p>
          <a href={`${SITE_URL}/#zlecenie`} className="mt-4 inline-block rounded-lg bg-brand-grafit px-5 py-3 font-semibold text-brand-kosc hover:opacity-90">
            Zleć wycenę
          </a>
        </section>

        {inneMiasta.length > 0 && (
          <section className="mt-12">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-chrom">
              Wykonawcy w innych miastach
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {inneMiasta.map((m) => (
                <Link
                  key={m.slug}
                  href={`/wykonawcy/${m.slug}`}
                  className="rounded-full border border-brand-border px-3 py-1 text-sm text-brand-chrom hover:border-brand-lime hover:text-brand-lime"
                >
                  {m.name}
                </Link>
              ))}
              <Link
                href="/wykonawcy"
                className="rounded-full border border-brand-border px-3 py-1 text-sm text-brand-lime hover:border-brand-lime"
              >
                Wszystkie miasta →
              </Link>
            </div>
          </section>
        )}

        <div className="mt-10 border-t border-brand-border pt-4">
          <p className="text-xs text-brand-chrom">
            Opinie przy profilach dodają klienci portalu. Oceny z Google pokazujemy osobno i nie weryfikujemy ich.
          </p>
          <PublicFooterNote />
        </div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
    </main>
  );
}
