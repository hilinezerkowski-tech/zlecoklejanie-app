import type { MetadataRoute } from "next";

/**
 * Panel aplikacji (zlecoklejanie-app) jest w całości za logowaniem —
 * nie ma tu żadnej treści przeznaczonej do indeksowania.
 *
 * Blokujemy wszystko, żeby:
 *  - roboty nie marnowały budżetu indeksowania na przekierowania do /login,
 *  - domena aplikacji nie konkurowała w wynikach z landing page'em,
 *  - adresy z tokenami (magic link, /auth/confirm) nie trafiły do indeksu.
 *
 * SEO obsługuje wyłącznie landing page: https://zlecoklejanie.pl
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
      },
    ],
    // Wskazujemy robotom właściwe źródło treści.
    host: "https://zlecoklejanie.pl",
    sitemap: "https://zlecoklejanie.pl/sitemap.xml",
  };
}
