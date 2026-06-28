import NextAuth from "next-auth";

import { authConfig } from "./auth.config";

// Edge-safe instance (no Prisma adapter) used purely for route gating.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  // Auth.js endpoints must always be reachable (sign-in, callback, csrf…).
  if (nextUrl.pathname.startsWith("/api/auth")) return;

  const isLoginPage = nextUrl.pathname === "/login";

  if (!isLoggedIn && !isLoginPage) {
    const url = new URL("/login", nextUrl.origin);
    url.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return Response.redirect(url);
  }

  if (isLoggedIn && isLoginPage) {
    return Response.redirect(new URL("/", nextUrl.origin));
  }
});

export const config = {
  // Run on every route except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|jpg|jpeg|webp)$).*)"],
};
