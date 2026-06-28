import type { NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";

/**
 * Edge-safe Auth.js configuration.
 *
 * This file MUST NOT import the Prisma adapter (or anything Node-only): it is
 * loaded by `middleware.ts`, which runs on the edge runtime. The database
 * adapter is attached separately in `auth.ts` (Node runtime).
 *
 * Providers are registered only when their credentials are present, so the
 * login screen shows exactly the sign-in options you've configured.
 */
const providers: Provider[] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Both Google and GitHub return verified emails, so linking a second
      // provider to an existing account by email is safe and avoids the
      // confusing "account already exists" dead-end.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

/** The list of configured provider ids, for rendering the login screen. */
export const enabledProviders = providers.map((p) => {
  const cfg = typeof p === "function" ? p() : p;
  return { id: cfg.id, name: cfg.name };
});

export const authConfig = {
  // Required when running behind a proxy / on AWS (ALB, CloudFront, etc.) where
  // the Host header is set by infrastructure rather than the Vercel runtime.
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
