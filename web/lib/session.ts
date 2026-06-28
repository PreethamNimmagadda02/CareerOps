import { auth } from "@/auth";

/**
 * Resolve the signed-in user's id for a route handler / server component.
 * Returns `null` when there is no valid session — callers should respond 401.
 */
export async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
