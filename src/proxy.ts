import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** The site is open for browsing, and guests keep a cart. Only these paths need an account. */
const PRIVATE_PATHS = ["/admin", "/pending", "/orders", "/deliveries", "/team"];

function isPrivate(pathname: string) {
  return PRIVATE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session cookie on every request and sends signed-out
 * visitors of private paths to /login. This is only an optimistic check: pages
 * and server actions still verify the user and their permissions themselves.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && isPrivate(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

/**
 * Pages, server actions and the API routes that use the session. Skipped:
 * - static files, images (`.avif` included) and the metadata routes (manifest, robots,
 *   sitemap, Open Graph images), which never read the session;
 * - the public catalog APIs (`/api/search` on every keystroke, `/api/catalog`, `/api/discover`,
 *   `/api/family/…`), which don't either;
 * - router prefetches. A prefetch only renders what's static, cached or read from the cookies
 *   as they are (getViewer waits for the navigation, behind connection()), so it needs neither
 *   a refreshed session nor the /login redirect; the click's own request still gets both.
 */
export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|opengraph-image|api/(?:search|catalog|discover|family)(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
