/** @type {import('next').NextConfig} */
// assetPrefix: strony katalogu/profili serwowane pod zlecoklejanie.pl przez proxy
// Netlify -> Vercel ładują _next/static (CSS/JS) bezpośrednio z domeny Vercela.
// Tylko na produkcji, żeby nie psuć lokalnego `next dev`.
const nextConfig = {
  assetPrefix:
    process.env.NODE_ENV === "production"
      ? process.env.NEXT_PUBLIC_ASSET_PREFIX ||
        "https://zlecoklejanie-app.vercel.app"
      : undefined,
};
export default nextConfig;
