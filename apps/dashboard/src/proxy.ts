/**
 * The page gate (spec 008 US1-1, research R-03 and its `T-OPS-04` amendment). Next.js 16
 * `proxy.ts` (formerly `middleware.ts`) checks the cookie's signature and expiry and
 * redirects to `/sign-in` otherwise; it cannot see this process's sign-out revocations, so
 * every `/api/*` handler checks the session again and answers 401.
 */
import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionCookie } from "./lib/server/session-cookie";

export function proxy(request: NextRequest): NextResponse {
  const { TAMIZ_DASHBOARD_SESSION_SECRET: secret = "" } = process.env;
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const claims =
    secret === "" || cookie === undefined ? undefined : verifySessionCookie(cookie, secret);
  if (claims !== undefined && Date.now() < claims.expiresAt) return NextResponse.next();
  // A cookie that no longer verifies (expired, or signed with another secret) ended a
  // session: the sign-in page says so. No cookie at all is a plain sign-in.
  const target = new URL("/sign-in", request.url);
  if (cookie !== undefined) target.searchParams.set("session", "expired");
  return NextResponse.redirect(target);
}

export const config = {
  // Every page except the sign-in page; data endpoints and assets are not pages.
  matcher: ["/((?!api/|_next/|sign-in|favicon\\.ico).*)"],
};
