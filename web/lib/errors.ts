/**
 * Turn a caught error into a sentence a person can act on.
 *
 * Raw messages ("Failed to fetch", "HTTP 500", Prisma text) never reach the
 * screen: a dropped connection says to check the connection, anything else
 * says to try again. Messages we wrote ourselves for people can opt in by
 * being thrown as a `FriendlyError`.
 */
export class FriendlyError extends Error {}

const OFFLINE_HINT = "Check your internet connection and try again.";
const GENERIC_HINT = "Please try again. If it keeps happening, reload the page.";

export function friendlyError(err: unknown): string {
  if (err instanceof FriendlyError) return err.message;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  // fetch() rejects with a TypeError when the request never reached the server.
  if (offline || err instanceof TypeError) return OFFLINE_HINT;
  return GENERIC_HINT;
}
