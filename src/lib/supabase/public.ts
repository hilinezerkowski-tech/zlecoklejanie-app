import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Publiczny klient Supabase (anon key) BEZ cookies/sesji.
 *
 * Do odczytu danych publicznych (katalog wykonawców, profile, sitemap) w miejscach,
 * które wykonują się poza żądaniem — generateStaticParams, statyczne renderowanie,
 * ISR, sitemap. Klient serwerowy oparty na cookies (`@/lib/supabase/server`) rzuca
 * tam "cookies was called outside a request scope". RLS dalej obowiązuje: anon widzi
 * tylko to, co polityki publiczne (aktywne studia, opublikowane opinie).
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
