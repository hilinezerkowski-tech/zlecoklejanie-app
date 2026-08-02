import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
            cookies: {
                      getAll() { return request.cookies.getAll(); },
                      setAll(cookiesToSet: any[]) {
                                  cookiesToSet.forEach(({ name, value, options }: any) => request.cookies.set(name, value));
                                  supabaseResponse = NextResponse.next({ request });
                                  cookiesToSet.forEach(({ name, value, options }: any) =>
                                                supabaseResponse.cookies.set(name, value, options)
                                                                 );
                      },
            },
    }
      );

  const { data: { user } } = await supabase.auth.getUser();
    const pathname = request.nextUrl.pathname;

  const publicPaths = ["/login", "/auth/callback", "/auth/confirm"];
    if (publicPaths.some((p) => pathname.startsWith(p))) {
          return supabaseResponse;
    }

  if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

  const role = profile?.role;

  if (pathname.startsWith("/admin") && role !== "admin") {
        return NextResponse.redirect(new URL("/login", request.url));
  }
    if (pathname.startsWith("/studio") && role !== "studio") {
          return NextResponse.redirect(new URL("/login", request.url));
    }
    if (pathname.startsWith("/klient") && role !== "client") {
          return NextResponse.redirect(new URL("/login", request.url));
    }

  return supabaseResponse;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
