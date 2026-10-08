import type { MetadataRoute } from "next";
import { getCatalogStudios, czyPustyProfil } from "@/lib/catalog";
import { stronyMiast } from "@/lib/catalog-geo";

// Mapa publicznej części portalu (katalog + miasta + profile).
// Serwowana pod zlecoklejanie.pl/sitemap-wykonawcy.xml przez proxy Netlify -> Vercel
// (middleware musi przepuszczać /sitemap.xml bez logowania).
// Wszystkie URL-e wskazują domenę brandową (canonical stron też).
//
// Bez lastModified / priority / changeFrequency: Google ignoruje dwa ostatnie, a lastmod bierze
// pod uwagę tylko, gdy jest prawdziwy — nie mamy daty ostatniej zmiany profilu, więc nie udajemy.
// Do mapy trafiają tylko strony indeksowalne: puste profile i miasta bez uzupełnionego profilu
// mają noindex (patrz czyPustyProfil / StronaMiasta.indexable).
const SITE_URL = "https://zlecoklejanie.pl";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const studios = await getCatalogStudios();

  const base: MetadataRoute.Sitemap = [{ url: `${SITE_URL}/wykonawcy` }];

  const miasta: MetadataRoute.Sitemap = stronyMiast(studios)
    .filter((c) => c.indexable)
    .map((c) => ({ url: `${SITE_URL}/wykonawcy/${c.slug}` }));

  const profile: MetadataRoute.Sitemap = studios
    .filter((s) => s.slug && !czyPustyProfil(s))
    .map((s) => ({ url: `${SITE_URL}/wykonawca/${s.slug}` }));

  return [...base, ...miasta, ...profile];
}
