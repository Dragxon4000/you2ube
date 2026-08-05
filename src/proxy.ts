import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, getUserByToken } from "@/lib/auth/session";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (the exported function is
// now `proxy`, not `middleware`). This runs on the Node.js runtime by
// default, which lets us query PostgreSQL directly via `pg`/Drizzle instead
// of maintaining a second, edge-compatible auth mechanism.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/profile/:path*",
    "/watch/:path*",
    "/social/:path*",
    "/login",
    "/signup",
  ],
};

const PROTECTED_PREFIXES = ["/dashboard", "/profile", "/watch", "/social"];
const AUTH_ONLY_PAGES = ["/login", "/signup"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await getUserByToken(token) : null;

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuthOnlyPage = AUTH_ONLY_PAGES.includes(pathname);

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthOnlyPage && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}
