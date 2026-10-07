import type { MetadataRoute } from "next";

/**
 * robots.txt domeny aplikacji (zlecoklejanie-app.vercel.app).
 *
 * Panel jest w całości za logowaniem, a publiczny katalog (/wykonawcy, /wykonawca/*) jest
 * indeksowany pod domeną brandową zlecoklejanie.pl (proxy Netlify -> Vercel, canonical tam).
 * Dlatego na tej domenie blokujemy wszystko, żeby:
 *  - roboty nie marnowały budżetu indeksowania na przekierowania do /login,
 *  - domena aplikacji nie konkurowała w wynikach z zlecoklejanie.pl,
 *  - adresy z tokenami (magic link, /auth/confirm, /o/<token>) nie trafiły do indeksu.
 *
 * WYJĄTEK: /_next/static/ i /_next/image. Strony katalogu serwowane pod zlecoklejanie.pl
 * ładują CSS i JS właśnie stąd (assetPrefix w next.config.mjs). Gdyby robots.txt blokował
 * te zasoby, Google renderowałby katalog bez stylów i skryptów.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/_next/static/", "/_next/image"],
        disallow: "/",
      },
    ],
    // Wskazujemy robotom właściwe źródło treści.
    host: "https://zlecoklejanie.pl",
    sitemap: "https://zlecoklejanie.pl/sitemap.xml",
  };
}
