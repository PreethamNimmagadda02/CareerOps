/**
 * Owner resolution for the CLI pipeline.
 *
 * The pipeline (scan / evaluate / portals) is a single-operator process, but the
 * data model is multi-user: every Application / Portal / FilterKeyword belongs to
 * exactly one `User`. To bridge the two, every CLI run resolves the *owner* whose
 * data it should read and write.
 *
 * Resolution order:
 *   1. `CAREER_OPS_USER_ID`    — an existing User id (used by the web dashboard,
 *                                which injects the signed-in user's id when it
 *                                spawns the pipeline).
 *   2. `CAREER_OPS_USER_EMAIL` — a human-friendly email. The matching User is
 *                                created on first use (upsert) so running the CLI
 *                                directly "just works".
 *
 * If neither is set the CLI fails fast with an actionable message rather than
 * silently writing orphaned, invisible rows.
 */
import { db } from "./db.js";

let cached: string | undefined;

export async function resolveOwnerUserId(): Promise<string> {
  if (cached) return cached;

  const explicitId = process.env.CAREER_OPS_USER_ID?.trim();
  if (explicitId) {
    const user = await db.user.findUnique({ where: { id: explicitId } });
    if (!user) {
      throw new Error(
        `CAREER_OPS_USER_ID "${explicitId}" does not match any user. ` +
          `Sign in to the dashboard once to create the account, or use CAREER_OPS_USER_EMAIL.`,
      );
    }
    cached = user.id;
    return cached;
  }

  const email = process.env.CAREER_OPS_USER_EMAIL?.trim().toLowerCase();
  if (email) {
    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: { email, name: email.split("@")[0] },
    });
    cached = user.id;
    return cached;
  }

  throw new Error(
    "No pipeline owner configured. Set CAREER_OPS_USER_EMAIL (recommended for CLI use) " +
      "or CAREER_OPS_USER_ID in your environment so scanned/evaluated jobs are attributed to a user.",
  );
}
