// Optimistic gate: bounce requests without a valid signed session before rendering.
// Pages and server actions still re-check the session (and the DB for members).
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIES, verifySession, type SessionKind } from "@/lib/jwt";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const kind: SessionKind = pathname.startsWith("/admin") ? "admin" : "member";
  const { name, loginPath } = SESSION_COOKIES[kind];

  if (pathname === loginPath) return NextResponse.next();

  const session = await verifySession(request.cookies.get(name)?.value, kind);
  if (!session) {
    return NextResponse.redirect(new URL(loginPath, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/customers",
    "/customers/:path*",
  ],
};
