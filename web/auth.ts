import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { db } from "../src/lib/db";
import { authConfig } from "./auth.config";

/**
 * Full Auth.js instance (Node runtime). Persists users, accounts, and sessions
 * to Postgres through the shared Prisma client, while issuing JWT session
 * cookies so authorization works in edge middleware too.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  ...authConfig,
});
