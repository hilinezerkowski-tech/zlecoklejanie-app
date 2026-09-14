import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";

  // Ochrona przed open redirect — dopuszczamy wyłącznie ścieżki względne
  // wewnątrz aplikacji ("/..."), nigdy "//evil.com" ani pełnych URL-i.
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Po zalogowaniu — redirect na stronę główną (middleware przeniesie do panelu)
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Błąd auth — redirect na login z komunikatem
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
