import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/job-titles?q=<query> — autocomplete job title suggestions
 *
 * Sourced from real, currently-listed job postings across TWO free, keyless
 * public job boards:
 *   - We Work Remotely (10 category RSS feeds — programming, design,
 *     devops/sysadmin, product, management/finance, customer support,
 *     sales/marketing) — the primary source, ~200+ unique titles, broad
 *     coverage across both tech and non-tech roles.
 *   - RemoteOK (single JSON feed) — a smaller, tech-focused supplement.
 *
 * Combining both gives a much larger and more varied pool than either alone
 * (roughly 300+ unique titles vs. ~90 from RemoteOK by itself), covering
 * engineering, product, design, sales, marketing, support, and finance
 * roles — not just software engineering.
 *
 * Titles are cleaned (company-name prefixes, gender-marker suffixes like
 * "(m/w/d)", HTML entities, trailing location fragments) and filtered to
 * exclude obviously non-English listings, then cached in-memory (the
 * combined fetch is a non-trivial number of requests — too slow/heavy to
 * redo on every keystroke).
 *
 * Used for both "Job titles you want" and "Avoid these roles" — both are
 * just free-form job-title strings, so the same suggestion source works
 * for either direction.
 */

const UA = "CareerOps/1.0 (job-search dashboard; contact@careerops.dev)";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const WWR_CATEGORIES = [
  "remote-full-stack-programming-jobs",
  "remote-front-end-programming-jobs",
  "remote-back-end-programming-jobs",
  "remote-programming-jobs",
  "remote-design-jobs",
  "remote-devops-sysadmin-jobs",
  "remote-management-and-finance-jobs",
  "remote-product-jobs",
  "remote-customer-support-jobs",
  "remote-sales-and-marketing-jobs",
];

let cache: { titles: string[]; fetchedAt: number } | null = null;
let inFlight: Promise<string[]> | null = null;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

/**
 * Clean a raw job-title string from either source into a plain, presentable
 * title: strips "Company Name: " prefixes (WWR), gender-marker suffixes
 * common on European job boards, "(copy)" artifacts, trailing pipe-delimited
 * taglines, and trailing "- City, ST" location fragments.
 */
function cleanTitle(raw: string): string {
  let t = decodeEntities(raw);

  // WWR titles are "Company Name: Job Title" — drop the company prefix.
  const colonIdx = t.indexOf(": ");
  if (colonIdx > 0 && colonIdx < 60) t = t.slice(colonIdx + 2);

  t = t.replace(/\s*\(copy\)\s*/gi, " ");
  t = t.replace(/\(\s*[mwfdx]\s*\/\s*[mwfdx]\s*(\/\s*[mwfdx]\s*)?\)/gi, "");
  t = t.replace(/\(\s*all genders?\s*\)/gi, "");
  t = t.replace(/[\u2010-\u2015\u23e4]/g, "-"); // normalize dash/bar variants
  t = t.replace(/\s*-\s*[A-Z][A-Za-z. ]+,\s*[A-Z]{2}$/, ""); // trailing "- City, ST"
  t = t.split("|")[0];
  t = t.replace(/\s{2,}/g, " ").trim();
  t = t.replace(/[-/]+$/, "").trim();

  return t;
}

/** Rough heuristic to filter out obviously non-English listings. */
function looksEnglish(t: string): boolean {
  if (/[äöüßÄÖÜ]/.test(t)) return false;
  if (/[\u00c0-\u00ff]{2,}/.test(t)) return false; // runs of accented Latin (PT/FR/ES-heavy)
  if (t.length < 3 || t.length > 70) return false;
  return true;
}

async function fetchWWRTitles(): Promise<string[]> {
  const results = await Promise.allSettled(
    WWR_CATEGORIES.map(async (cat) => {
      const res = await fetch(`https://weworkremotely.com/categories/${cat}.rss`, {
        headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml" },
        signal: AbortSignal.timeout(6_000),
      });
      if (!res.ok) throw new Error(`WWR ${cat} returned ${res.status}`);
      const xml = await res.text();
      // Skip index 0 — that's the channel's own <title>, not a job listing.
      return [...xml.matchAll(/<title>(.*?)<\/title>/g)].map((m) => m[1]).slice(1);
    }),
  );

  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

async function fetchRemoteOKTitles(): Promise<string[]> {
  const res = await fetch("https://remoteok.com/api", {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(6_000),
  });
  if (!res.ok) throw new Error(`RemoteOK returned ${res.status}`);
  const data = (await res.json()) as Array<{ position?: string }>;
  return data
    .map((entry) => entry.position?.trim())
    .filter((t): t is string => typeof t === "string" && t.length > 1 && t.length < 80);
}

async function fetchTitles(): Promise<string[]> {
  const [wwr, remoteok] = await Promise.allSettled([fetchWWRTitles(), fetchRemoteOKTitles()]);

  const raw = [
    ...(wwr.status === "fulfilled" ? wwr.value : []),
    ...(remoteok.status === "fulfilled" ? remoteok.value : []),
  ];

  const cleaned = raw.map(cleanTitle).filter(looksEnglish);
  return [...new Set(cleaned)];
}

async function getTitles(): Promise<string[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.titles;

  // Coalesce concurrent requests into a single upstream fetch.
  if (!inFlight) {
    inFlight = fetchTitles()
      .then((titles) => {
        cache = { titles, fetchedAt: Date.now() };
        return titles;
      })
      .catch((err) => {
        console.warn("[job-titles] fetch failed:", (err as Error).message);
        // Fall back to a stale cache if we have one; otherwise empty.
        return cache?.titles ?? [];
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase();

  if (!q || q.length < 2) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    const titles = await getTitles();
    const matches = titles
      .filter((t) => t.toLowerCase().includes(q))
      // Prefer titles that *start with* the query, then shorter titles first.
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.length - b.length;
      })
      .slice(0, 8);

    return NextResponse.json(matches);
  } catch (err) {
    console.warn("[job-titles] error:", (err as Error).message);
    return NextResponse.json([], { status: 200 });
  }
}
