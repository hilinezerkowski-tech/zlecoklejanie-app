import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Weryfikacja linku logowania opartego o `token_hash`.
 *
 * Dlaczego osobna trasa obok /auth/callback:
 *  - /auth/callback obsluguje flow PKCE (`?code=`) — tak dziala logowanie
 *    inicjowane w przegladarce przez signInWithOtp na stronie /login,
 *  - linki generowane PO STRONIE SERWERA przez `auth.admin.generateLink`
 *    (mail powitalny dla nowego studia) zwracaja `hashed_token`, ktory
 *    wymienia sie na sesje przez `verifyOtp`. Bez tej trasy taki link
 *    nie zalogowalby uzytkownika.
 *
 * Middleware ma juz /auth/confirm na liscie sciezek publicznych.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/";

  // Ochrona przed open redirect — dopuszczamy wylacznie sciezki wzgledne
  // wewnatrz aplikacji ("/..."), nigdy "//evil.com" ani pelnych URL-i.
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.warn("[auth/confirm] verifyOtp failed:", error.message);
  }

  // Link zuzyty lub wygasly — kierujemy na logowanie, gdzie uzytkownik
  // poprosi o swiezy link jednym kliknieciem.
  return NextResponse.redirect(`${origin}/login?error=link`);
}
