/**
 * Store for the global `Posting` corpus — the shared set of discovered job
 * postings that the scheduled scan fills once and every user's match reads.
 *
 * Bulk upsert uses a single `INSERT … ON CONFLICT (url) DO UPDATE` per chunk so
 * refreshing thousands of postings is a handful of round-trips, not one query
 * per row. After a full scan, `deactivatePostingsNotSeenSince` flips postings
 * that didn't reappear to `active = false` (filled/removed listings).
 */
import { Prisma } from "@prisma/client";

import { db } from "./db.js";
import type { Job } from "../types.js";

/** Insert-or-refresh a batch of scanned postings. Returns rows written. */
export async function upsertPostings(jobs: Job[], seenAt: Date): Promise<number> {
  // Collapse repeats within the batch — url is the posting's identity.
  const byUrl = new Map<string, Job>();
  for (const j of jobs) {
    if (j.url) byUrl.set(j.url, j);
  }
  const rows = [...byUrl.values()];
  if (rows.length === 0) return 0;

  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk.map(
      (j) =>
        Prisma.sql`(gen_random_uuid(), ${j.url}, ${j.company ?? ""}, ${j.title ?? ""}, ${
          j.location ?? ""
        }, ${j.source ?? ""}, true, ${seenAt}, ${seenAt}, now())`,
    );
    written += await db.$executeRaw`
      INSERT INTO "Posting" (id, url, company, title, location, source, active, "lastSeenAt", "firstSeenAt", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT (url) DO UPDATE SET
        company = EXCLUDED.company,
        title = EXCLUDED.title,
        location = EXCLUDED.location,
        source = EXCLUDED.source,
        active = true,
        "lastSeenAt" = EXCLUDED."lastSeenAt",
        "updatedAt" = now()
    `;
  }
  return written;
}

/**
 * Deactivate postings that weren't refreshed by the latest scan (their
 * `lastSeenAt` predates the scan's start), i.e. no longer listed. Returns the
 * number deactivated.
 *
 * `companies` scopes deactivation to boards that were SUCCESSFULLY scanned this
 * run — so a transient fetch failure for a board doesn't wrongly retire all of
 * that company's still-open postings.
 */
export async function deactivatePostingsNotSeenSince(
  scanStartedAt: Date,
  companies?: string[],
): Promise<number> {
  const { count } = await db.posting.updateMany({
    where: {
      active: true,
      lastSeenAt: { lt: scanStartedAt },
      ...(companies && companies.length ? { company: { in: companies } } : {}),
    },
    data: { active: false },
  });
  return count;
}

/** All currently-active postings, shaped for the matchers (`Job`). */
export async function getActivePostings(): Promise<Job[]> {
  const rows = await db.posting.findMany({
    where: { active: true },
    select: { company: true, title: true, url: true, location: true, source: true },
  });
  return rows.map((r) => ({
    company: r.company,
    title: r.title,
    url: r.url,
    location: r.location,
    source: r.source,
  }));
}

/** Count + freshness of the active corpus, for staleness guards / diagnostics. */
export async function postingCorpusStatus(): Promise<{ active: number; lastSeenAt: Date | null }> {
  const [active, latest] = await Promise.all([
    db.posting.count({ where: { active: true } }),
    db.posting.findFirst({ orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } }),
  ]);
  return { active, lastSeenAt: latest?.lastSeenAt ?? null };
}

/**
 * Active postings still missing a cached JD, oldest-discovered first — so a
 * capped prefetch pass drains the backlog in FIFO order across runs instead
 * of always refetching the same recent postings.
 */
export async function getPostingsNeedingJD(limit: number): Promise<{ url: string }[]> {
  return db.posting.findMany({
    where: { active: true, jd: null },
    orderBy: { firstSeenAt: "asc" },
    take: limit,
    select: { url: true },
  });
}

/**
 * Cache a successfully-extracted JD for a posting. Callers should only pass a
 * real extraction (never a failure sentinel) — leaving `jd` null on failure
 * lets the next scan or evaluate's live-fetch fallback simply retry.
 */
export async function setPostingJD(url: string, jd: string): Promise<void> {
  await db.posting.update({ where: { url }, data: { jd, jdFetchedAt: new Date() } });
}

/** Cached JD text for a posting, or null if not yet fetched. */
export async function getPostingJD(url: string): Promise<string | null> {
  const row = await db.posting.findUnique({ where: { url }, select: { jd: true } });
  return row?.jd ?? null;
}
