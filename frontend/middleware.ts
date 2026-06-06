import { NextRequest, NextResponse } from "next/server";

// Redirect unauthenticated requests to /login. Authentication state is
// inferred from the presence of the `sb_session` cookie; the cookie is
// httpOnly so we can't read its value here, only its existence — which is
// fine for routing. The backend is the authoritative validator.
//
// Public paths bypass the redirect (PWA shell, customer invoice links,
// auth endpoints themselves, and Next.js' own static assets).

const PUBLIC_PREFIXES = [
  "/login",
  "/i/",              // public invoice token page
  "/_next/",
  "/api/auth/",       // direct backend calls (if any go through frontend proxy)
  "/manifest.webmanifest",
  "/sw.js",
  "/favicon",
  "/icon-",
  "/apple-icon",
  "/simplebooks-wordmark",
];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return false;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const hasSession = req.cookies.has("sb_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Run on every path except statics and image optimisation.
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf)$).*)"],
};
