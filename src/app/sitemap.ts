import type { MetadataRoute } from "next";
import { getCatalogStudios, cityIndex } from "@/lib/catalog";

// Mapa publicznej części portalu (katalog + miasta + profile).
// Serwowana pod zlecoklejanie.pl przez proxy Netlify -> Vercel.
// Wszystkie URL-e wskazują domenę brandową (canonical stron też).
const SITE_URL = "https://zlecoklejanie.pl";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const studios = await getCatalogStudios();
  const now = new Date();

  const base: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/wykonawcy`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
  ];

  const miasta: MetadataRoute.Sitemap = cityIndex(studios).map((c) => ({
    url: `${SITE_URL}/wykonawcy/${c.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const profile: MetadataRoute.Sitemap = studios
    .filter((s) => s.slug)
    .map((s) => ({
      url: `${SITE_URL}/wykonawca/${s.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

  return [...base, ...miasta, ...profile];
}
