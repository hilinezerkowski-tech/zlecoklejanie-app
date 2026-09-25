/** @type {import('next').NextConfig} */
// assetPrefix: strony katalogu/profili serwowane pod zlecoklejanie.pl przez proxy
// Netlify -> Vercel ładują _next/static (CSS/JS) bezpośrednio z domeny Vercela.
// Gate na VERCEL_ENV, nie NODE_ENV: podglądy Vercela też budują z
// NODE_ENV=production, a z prefixem ładowały chunki z produkcji (404 → wysypka).
const nextConfig = {
  assetPrefix:
    process.env.VERCEL_ENV === "production"
      ? process.env.NEXT_PUBLIC_ASSET_PREFIX ||
        "https://zlecoklejanie-app.vercel.app"
      : undefined,
};
export default nextConfig;
