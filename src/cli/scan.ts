#!/usr/bin/env node
/**
 * career-ops scan — match the shared job-posting corpus against ONE user's
 * preferences and refresh their tracked shortlist.
 *
 * This no longer scrapes job boards. The heavy portal fetching is done once,
 * system-wide, by the scheduled shared scan (`career-ops-scan-portals`), which
 * fills the global `Posting` corpus. Here we just:
 *   1. read the active corpus,
 *   2. run the user's title / engineering / location matchers over it,
 *   3. upsert the high-signal shortlist into their Applications, and
 *   4. prune tracked rows whose postings are no longer active.
 * The result is a per-user operation that runs in milliseconds with zero
 * outbound scraping — instead of every user re-fetching all ~685 boards.
 *
 * Usage: career-ops-scan [--compact] [--verbose]   (scan flags accepted, ignored)
 */
import { AppStatus } from "@prisma/client";

import { Args } from "../lib/args.js";
import { log } from "../lib/logger.js";
import {
  engineeringMatch,
  isHighSignal,
  locationMatch,
  normalizeMatchingPrefs,
  titleMatches,
} from "../lib/matching.js";
import { loadConfigFromDb } from "../lib/portals-db.js";
import { getActivePostings, postingCorpusStatus } from "../lib/postings.js";
import { resolveOwnerUserId } from "../lib/owner.js";
import { getProfile } from "../lib/profile-store.js";
import { validateMatchingReadiness } from "../lib/profile-validation.js";
import { normalizeUrl } from "../lib/text.js";
import { validateJobUrls } from "../lib/url-validator.js";
import { db } from "../lib/db.js";
import type { Job, RelevantJob } from "../types.js";

async function main(): Promise<void> {
  const args = new Args();
  const compact = args.has("--compact");
  const verbose = args.has("--verbose");
  // Some ATS platforms (e.g. Ashby) leave a filled/closed job in their API
  // feed while the page itself renders "no longer available" — the shared
  // corpus scan has no way to detect that (it only sees the feed). Validating
  // every corpus posting with a browser would be far too expensive globally,
  // so it happens here instead, scoped to this user's small high-signal
  // shortlist, right before those postings are added to their tracker.
  const browserValidate = args.has("--fallback");
  const browserConcurrency = args.number("--browser-concurrency", 3);

  const userId = await resolveOwnerUserId();

  // Keywords are per-user; portals are irrelevant here (the shared scan owns
  // them). loadConfigFromDb still gives us the user's include/exclude filters.
  const config = await loadConfigFromDb(userId);

  const profile = await getProfile(userId);
  const matchingReadiness = validateMatchingReadiness(profile);
  if (!matchingReadiness.ok) {
    log.error(
      "❌ Scan blocked — job matching preferences are missing:\n" +
        matchingReadiness.missing.map((m) => `   • ${m}`).join("\n") +
        "\n   Fill in the “Job Matching” section on your profile page, then try again.",
    );
    process.exit(1);
  }
  const matchingPrefs = normalizeMatchingPrefs(profile?.matching);

  if (config.positive.length === 0) {
    log.error(
      "❌ No title-filter keywords configured. Add at least one “Include” keyword before scanning:\n" +
        '   npm run portals -- keywords add --kind positive --value "software engineer"\n' +
        "   (or use the Keywords panel in the dashboard).",
    );
    process.exit(1);
  }

  // ── Read the shared corpus ───────────────────────────────────────────────
  const corpus = await postingCorpusStatus();
  if (corpus.active === 0) {
    log.warn(
      "⚠️  The shared job corpus is empty. The scheduled portal scan hasn't run yet —\n" +
        "   run `npm run scan:portals` (or wait for the schedule) to populate it.",
    );
  } else {
    const ageMin = corpus.lastSeenAt
      ? Math.round((Date.now() - corpus.lastSeenAt.getTime()) / 60000)
      : null;
    log.step(
      `📚 Matching against ${corpus.active} active postings` +
        (ageMin !== null ? ` (last refreshed ${ageMin} min ago)` : ""),
    );
  }

  const jobs = await getActivePostings();

  // ── Match (title → engineering → location), dedup by URL ─────────────────
  const relevant: RelevantJob[] = [];
  const skipped = { title: 0, nonEngineering: 0, location: 0, duplicate: 0 };
  const seenInRun = new Set<string>();

  // Corpus matching itself is a fast in-memory sweep (well under a second even
  // at tens of thousands of postings), but the client still needs a genuine
  // "how much of the corpus have we compared against" signal rather than only
  // seeing the much smaller post-match shortlist. Log every ~1/50th of the
  // corpus (plus the final item) so the progress bar reflects real sweep
  // progress without writing one log line per posting.
  const total = jobs.length;
  const logEvery = Math.max(1, Math.ceil(total / 50));
  let scanned = 0;

  for (const job of jobs) {
    scanned++;
    if (scanned % logEvery === 0 || scanned === total) {
      log.info(`   📊 Progress: ${scanned}/${total} postings scanned`);
    }

    const match = titleMatches(job.title || "", config.positive, config.negative);
    if (!match.relevant) {
      skipped.title += 1;
      continue;
    }
    const eng = engineeringMatch(job.title || "", matchingPrefs);
    if (!eng.engineering) {
      skipped.nonEngineering += 1;
      continue;
    }
    const loc = locationMatch(job.location, matchingPrefs);
    if (!loc.eligible) {
      skipped.location += 1;
      continue;
    }
    const urlKey = normalizeUrl(job.url);
    if (seenInRun.has(urlKey)) {
      skipped.duplicate += 1;
      continue;
    }
    seenInRun.add(urlKey);
    relevant.push({ ...job, match, engineeringMatch: eng, locationMatch: loc });
  }

  let shortlist = relevant.filter((job) => isHighSignal(job, matchingPrefs));
  log.step(
    `📊 ${jobs.length} postings → ${relevant.length} relevant, ${shortlist.length} high-signal ` +
      `(skipped: ${skipped.title} title, ${skipped.nonEngineering} non-eng, ${skipped.location} location, ${skipped.duplicate} dup)`,
  );

  if (browserValidate && shortlist.length > 0) {
    shortlist = await validateJobUrls(shortlist, browserConcurrency);
  }

  // ── 1. Upsert the shortlist into the user's Applications (URL-deduped) ────
  if (shortlist.length > 0) {
    const date = new Date().toISOString().slice(0, 10);
    const { count: addedCount } = await db.application.createMany({
      data: shortlist.map((job) => ({
        userId,
        date,
        company: job.company,
        role: job.title,
        url: job.url,
        score: "N/A",
        status: AppStatus.Evaluated,
        pdf: "❌",
        reportName: "",
      })),
      skipDuplicates: true,
    });

    if (addedCount > 0) {
      log.step(`➕ Added ${addedCount} new shortlisted job(s) to Postgres:`);
      for (const j of shortlist.slice(0, 20)) {
        log.info(`   ${j.company} — ${j.title}`);
        log.info(`   🔗 ${j.url}`);
      }
    } else {
      log.step("No new jobs to add (all shortlisted URLs already tracked).");
    }
  }

  // ── 2. Prune tracked rows whose postings are no longer active ────────────
  // Only rows where the candidate hasn't actively engaged are pruned; Applied /
  // Responded / Interview / Offer / Rejected are always kept.
  //
  // Staleness is decided by the posting's OWN `active` flag (via its URL), not
  // by whether it happens to reappear in this run's `relevant` shortlist. The
  // shortlist is recomputed from the user's CURRENT keyword/location prefs —
  // if those prefs are ever narrowed (or a source's postings just don't come
  // back within this run for an unrelated reason), a role that's already been
  // delivered to the user must not vanish out from under them. It should only
  // ever be removed once the underlying posting is genuinely gone.
  const ACTIVE_STATUSES: AppStatus[] = [
    AppStatus.Applied,
    AppStatus.Responded,
    AppStatus.Interview,
    AppStatus.Offer,
    AppStatus.Rejected,
  ];
  // Rows with no URL weren't sourced from the corpus (e.g. manually added) —
  // there's no posting to check them against, so leave them alone entirely
  // rather than treating "nothing to compare" as "stale."
  const pruneable = (
    await db.application.findMany({
      where: { userId, status: { notIn: ACTIVE_STATUSES } },
      select: { id: true, url: true },
    })
  ).filter((a): a is { id: string; url: string } => a.url !== null && a.url !== "");
  if (pruneable.length > 0) {
    const activePostings = await db.posting.findMany({
      where: { url: { in: pruneable.map((a) => a.url) }, active: true },
      select: { url: true },
    });
    const activeUrls = new Set(activePostings.map((p) => p.url));
    const stale = pruneable.filter((a) => !activeUrls.has(a.url));
    if (stale.length > 0) {
      await db.application.deleteMany({ where: { id: { in: stale.map((a) => a.id) } } });
      log.step(`🗑️  Pruned ${stale.length} application(s) whose postings are no longer active.`);
    } else {
      log.step("All tracked jobs are still active in the corpus.");
    }
  }

  if (compact) printCompact(shortlist, verbose);
}

function printCompact(shortlist: RelevantJob[], _verbose: boolean): void {
  const byCompany = new Map<string, Job[]>();
  for (const job of shortlist) {
    const list = byCompany.get(job.company) ?? [];
    list.push(job);
    byCompany.set(job.company, list);
  }
  log.info(`Corpus match ${new Date().toISOString().slice(0, 10)}`);
  log.info(`High-signal shortlist: ${shortlist.length}`);
  log.info("");
  for (const [company, companyJobs] of byCompany) {
    log.info(company);
    for (const job of companyJobs.slice(0, 8)) {
      log.info(`- ${job.title} | ${job.location || "Location not listed"} | ${job.url}`);
    }
  }
  log.info("");
}

main().catch((err: unknown) => {
  log.error(`❌ Fatal: ${(err as Error).message}`);
  process.exit(1);
});
