import type { Browser, Page } from "playwright";

import type { Company, Job, ScanResult } from "../types.js";

const FETCH_TIMEOUT_MS = 16_000;
const PAGE_TIMEOUT_MS = 25_000;

type StructuredMethod = "greenhouse" | "ashby" | "lever";

/** Extract the Ashby board slug from a careers URL, if present. */
export function slugFromAshby(url: string | undefined): string | null {
  const match = url?.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1] as string) : null;
}

/** Extract the Lever board slug from a careers URL, if present. */
export function slugFromLever(url: string | undefined): string | null {
  const match = url?.match(/jobs\.lever\.co\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1] as string) : null;
}

/** Extract the Greenhouse board slug from a careers URL, if present. */
export function slugFromGreenhouse(url: string | undefined): string | null {
  const match = url?.match(/(?:boards|job-boards)\.greenhouse\.io\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1] as string) : null;
}

/** Whether a company can be scanned via a structured JSON API. */
export function hasStructuredApi(company: Company): boolean {
  return Boolean(
    company.api ||
      slugFromAshby(company.careers_url) ||
      slugFromLever(company.careers_url) ||
      slugFromGreenhouse(company.careers_url),
  );
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "career-ops-scan/1.0" },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 80)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/** Build the structured job-board API URL for a discovered ATS slug. */
function apiUrlFor(method: StructuredMethod, slug: string): string {
  if (method === "ashby") return `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
  if (method === "lever") return `https://api.lever.co/v0/postings/${slug}?mode=json`;
  return `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;
}

function resolveApiSource(company: Company): { source: string; method: StructuredMethod } | null {
  if (company.api) return { source: company.api, method: "greenhouse" };
  const ashby = slugFromAshby(company.careers_url);
  if (ashby) return { source: apiUrlFor("ashby", ashby), method: "ashby" };
  const lever = slugFromLever(company.careers_url);
  if (lever) return { source: apiUrlFor("lever", lever), method: "lever" };
  const greenhouse = slugFromGreenhouse(company.careers_url);
  if (greenhouse) return { source: apiUrlFor("greenhouse", greenhouse), method: "greenhouse" };
  return null;
}

/** Fetch and parse jobs from a known structured job-board API. */
async function fetchStructuredJobs(
  company: Company,
  source: string,
  method: StructuredMethod,
): Promise<ScanResult> {
  const jobs: Job[] = [];
  try {
    // The shape varies per provider; we defensively access optional fields.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await fetchJson(source)) as any;

    if (method === "ashby") {
      for (const job of data.jobs || []) {
        jobs.push({
          company: company.name,
          title: job.title,
          url: job.jobUrl || job.applyUrl || `${company.careers_url}/${job.id || ""}`,
          location: (job.location || job.locationName || "").trim(),
          source,
        });
      }
    } else if (method === "lever") {
      for (const job of data || []) {
        jobs.push({
          company: company.name,
          title: job.text,
          url: job.hostedUrl || job.applyUrl,
          location: (job.categories?.location || "").trim(),
          source,
        });
      }
    } else {
      for (const job of data.jobs || []) {
        jobs.push({
          company: company.name,
          title: job.title,
          url: job.absolute_url || job.url,
          location: (job.location?.name || "").trim(),
          source,
        });
      }
    }
    return { company, method, jobs, error: "" };
  } catch (err) {
    return { company, method, jobs, error: (err as Error).message };
  }
}

/** Scan a company via its structured job-board API (Greenhouse/Ashby/Lever). */
export async function scanCompany(company: Company): Promise<ScanResult> {
  const resolved = resolveApiSource(company);
  if (!resolved) return { company, method: "unsupported", jobs: [], error: "" };
  return fetchStructuredJobs(company, resolved.source, resolved.method);
}

/** Known ATS link patterns to sniff for on an otherwise-bespoke careers page. */
const ATS_DISCOVERY: Array<{ method: StructuredMethod; regex: RegExp }> = [
  { method: "ashby", regex: /jobs\.ashbyhq\.com\/([^/?#"]+)/i },
  { method: "lever", regex: /jobs\.lever\.co\/([^/?#"]+)/i },
  { method: "greenhouse", regex: /(?:boards|job-boards)\.greenhouse\.io\/([^/?#"]+)/i },
];

/**
 * Many "bespoke" careers pages are just a marketing shell that links out to a
 * real Greenhouse/Lever/Ashby board (e.g. a custom domain embedding an Ashby
 * board link). Prefer that structured board over scraping the marketing page.
 */
async function discoverAtsBoard(
  page: Page,
): Promise<{ source: string; method: StructuredMethod } | null> {
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")].map((a) => (a as HTMLAnchorElement).href),
  );
  for (const { method, regex } of ATS_DISCOVERY) {
    for (const href of hrefs) {
      const match = href.match(regex);
      if (match) return { source: apiUrlFor(method, decodeURIComponent(match[1] as string)), method };
    }
  }
  return null;
}

/** Scan a company by scraping its careers page DOM with a headless browser. */
export async function scanCompanyBrowser(browser: Browser, company: Company): Promise<ScanResult> {
  if (!company.careers_url) {
    return { company, method: "browser", jobs: [], error: "missing careers_url" };
  }
  // Playwright's default UA advertises "HeadlessChrome", which a meaningful
  // slice of careers sites bot-detect and serve a stripped-down page for (no
  // job listings at all) — masquerading as a normal desktop Chrome fixes it.
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });
  try {
    await page.goto(company.careers_url, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
    await page.waitForTimeout(3500);

    const jobs = await page.evaluate((companyName: string) => {
      const words =
        /(engineer|architect|developer|machine learning|software|backend|platform|solutions|forward deployed|deployed|ai|ml|llm|agent|automation)/i;
      // Occupational nouns that mark real job titles specifically — unlike
      // `words` above (which also matches generic marketing copy: "Platform",
      // "AI-powered Solutions"), these rarely appear outside an actual title.
      // The final acceptance gate below requires one of these (or a
      // job-specific href) rather than the broader, leakier `words` set.
      const strongWords =
        /(engineer|architect|developer|scientist|researcher|specialist|manager|coordinator|recruiter|designer|director|counsel|attorney|representative|associate|technician|administrator|consultant|intern\b|lead\b|head of )/i;
      const bad =
        /(privacy|terms|cookie|linkedin|instagram|facebook|twitter|youtube|blog|about|contact|login|sign in)/i;
      // Anchor labels that are never a job title: apply/nav/CTA chrome duplicated
      // next to the real title link, e.g. a separate "Apply Now" button that
      // shares the job's own URL.
      const genericCta =
        /^(apply( now| today| here)?|join( today| now| our team| us)?|learn more|read more|view (more|all|all open positions|all roles|open positions|open roles)|see (more|all|all jobs)|clear all|explore|get started|sign up|subscribe|our values|talent community)$/i;
      // Locale switchers rendered as "<language> (<Language>)" links.
      const localeSwitcher = /^[\p{L}\s]{1,20}\s*\([\p{L}\s]{1,20}\)$/u;

      // A page with real job postings renders many structurally-identical
      // cards; a marketing/nav link that happens to contain a keyword like
      // "platform" or "solutions" is a one-off. Require either that repetition
      // (>=3 anchors sharing a class signature) or a strong, job-specific href
      // (an ATS domain or an id-bearing job path) before trusting keyword
      // matches alone — this is what keeps a bare marketing homepage from
      // fabricating "postings" out of its nav bar.
      //
      // NOTE: no named helper functions anywhere in this block — page.evaluate
      // ships the function body alone (via toString()), and tsx/esbuild's
      // keepNames mode wraps named function expressions in a `__name(...)`
      // call that only exists at the enclosing module scope, breaking the
      // isolated browser context. Everything here is inlined instead.
      const strongJobHref =
        /(gh_jid=|jobs\.lever\.co|jobs\.ashbyhq\.com|(?:boards|job-boards)\.greenhouse\.io|myworkdayjobs\.com|smartrecruiters\.com|icims\.com|workable\.com|breezy\.hr|\/jobs?\/[\w-]|\/careers?\/[\w-]+-[\w-]+)/i;
      const signatureCounts = new Map<string, number>();
      for (const anchor of document.querySelectorAll("a[href]")) {
        const ownClass = (anchor.getAttribute("class") || "").trim();
        const parentClass = anchor.parentElement?.getAttribute("class")?.trim();
        const sig = ownClass ? `class:${ownClass}` : parentClass ? `pclass:${parentClass}` : `tag:${anchor.tagName}`;
        signatureCounts.set(sig, (signatureCounts.get(sig) || 0) + 1);
      }

      const byHref = new Map<string, Job & { fromAnchorText: boolean }>();
      for (const anchor of document.querySelectorAll("a[href]")) {
        const href = new URL(anchor.getAttribute("href") as string, location.href).href;
        // Path+query+hash only — a domain like "wise.jobs" or "career.acme.com"
        // would otherwise make every single link on the whole site look
        // job-shaped to the loose href check below.
        const hrefPath = href.replace(/^[a-z]+:\/\/[^/]+/i, "");
        // innerText (not textContent) — it's CSS-aware and inserts a line
        // break between sibling block elements a browser visually renders on
        // separate lines. Many card layouts are ONE anchor wrapping title,
        // location and a CTA as separate <div>/<span> children with no
        // literal whitespace between them in the markup — textContent would
        // glue all three into one run-on string, but innerText's line breaks
        // let us take just the first line as the title and treat the rest as
        // a location/metadata candidate.
        const anchorLines = ((anchor as HTMLElement).innerText || anchor.textContent || "")
          .split("\n")
          .map((l) => l.replace(/\s+/g, " ").trim())
          .filter(Boolean);
        const rawText = anchorLines[0] || "";
        const anchorMetaLocation = anchorLines
          .slice(1)
          .filter((l) => l !== "·" && !genericCta.test(l) && !/^apply\b/i.test(l))
          .join(", ")
          .slice(0, 120);
        const rawParent = anchor.closest("li, article, tr, div") as HTMLElement | null;
        const parentFullText = rawParent ? rawParent.innerText || rawParent.textContent || "" : "";
        // A container that spans way more text than one card usually means
        // we grabbed a wrapper around the whole listing (every other posting
        // on the page), not this one job's card — better to have no location
        // than one stuffed with unrelated postings.
        const parentText =
          !rawParent || parentFullText.length > 600
            ? rawText
            : parentFullText.replace(/\s+/g, " ").trim();

        // Same-page CTA anchors (nav links, "#section" jumps) are never job
        // postings unless their own text is a strong job-title signal.
        const samePage = href.split("#")[0] === location.href.split("#")[0];
        if (samePage && !words.test(rawText)) continue;

        const ownClass = (anchor.getAttribute("class") || "").trim();
        const parentClass = anchor.parentElement?.getAttribute("class")?.trim();
        const sig = ownClass ? `class:${ownClass}` : parentClass ? `pclass:${parentClass}` : `tag:${anchor.tagName}`;
        const repeated = (signatureCounts.get(sig) || 0) >= 3;
        if (!repeated && !strongJobHref.test(href)) continue;

        const rawStripped = rawText.replace(/^[↳→▸›»\-•*\s]+/, "").trim();
        const anchorIsGeneric =
          rawStripped.length < 8 || genericCta.test(rawStripped) || localeSwitcher.test(rawStripped);
        const title = anchorIsGeneric ? parentText.slice(0, 140) : rawText;
        if (!title || title.length < 8 || title.length > 180) continue;
        if (anchorIsGeneric) {
          const titleStripped = title.replace(/^[↳→▸›»\-•*\s]+/, "").trim();
          if (
            titleStripped.length < 8 ||
            genericCta.test(titleStripped) ||
            localeSwitcher.test(titleStripped)
          )
            continue;
        }
        if (bad.test(title) || bad.test(href)) continue;
        if (
          !strongWords.test(title) &&
          !/(job|career|greenhouse|ashby|lever|workable|workday|apply)/i.test(hrefPath)
        )
          continue;

        // Look near the anchor for a tag/pill list (locations, departments) —
        // generic "text minus title" slicing can't reliably isolate these.
        let listLocation = "";
        for (let el: Element | null = anchor, depth = 0; el && depth < 5; el = el.parentElement, depth++) {
          if (((el as HTMLElement).innerText || el.textContent || "").length > 2000) break;
          const items = [...el.querySelectorAll("li")]
            .map((li) => (li.innerText || li.textContent || "").replace(/\s+/g, " ").trim())
            .filter((t) => t && t.length <= 40 && t !== title);
          if (items.length) {
            listLocation = [...new Set(items)].slice(0, 6).join(", ").slice(0, 120);
            break;
          }
        }
        const jobLocation =
          listLocation ||
          anchorMetaLocation ||
          (parentText === title ? "" : parentText.replace(title, "").trim().slice(0, 120));

        const fromAnchorText = !anchorIsGeneric;
        const candidate = {
          company: companyName,
          title,
          url: href,
          location: jobLocation,
          source: location.href,
          fromAnchorText,
        };
        const existing = byHref.get(href);
        const candidateIsBetter =
          !existing ||
          (candidate.fromAnchorText && !existing.fromAnchorText) ||
          (candidate.fromAnchorText === existing.fromAnchorText &&
            candidate.title.length > existing.title.length);
        if (candidateIsBetter) byHref.set(href, candidate);
      }

      return [...byHref.values()].slice(0, 80).map(({ fromAnchorText, ...row }) => row);
    }, company.name);

    // A linked-out ATS board (e.g. a custom domain embedding a Greenhouse
    // board) beats the DOM heuristic — but a coincidental, genuinely SMALLER
    // board unrelated to the real listing (e.g. a "join our talent
    // community" signup board living alongside a bespoke, fully-custom job
    // listing) should lose to the real listing rather than replace it. Raw
    // job-count comparison is too fragile for that call: a few unrelated
    // marketing/cookie-consent anchors the DOM heuristic picked up can
    // inflate its count past the real board's by a couple of jobs even when
    // the DOM scrape *is* just a messier version of that same board. URL
    // overlap is the reliable signal — if most of the discovered board's
    // postings are URLs we already scraped, it's the same board.
    const discovered = await discoverAtsBoard(page);
    if (discovered) {
      const result = await fetchStructuredJobs(company, discovered.source, discovered.method);
      if (!result.error && result.jobs.length > 0) {
        const domUrls = new Set(jobs.map((j) => j.url));
        const overlap = result.jobs.filter((j) => domUrls.has(j.url)).length / result.jobs.length;
        if (overlap >= 0.5 || result.jobs.length >= jobs.length) {
          return result;
        }
      }
    }

    return { company, method: "browser", jobs, error: "" };
  } catch (err) {
    return { company, method: "browser", jobs: [], error: (err as Error).message };
  } finally {
    await page.close().catch(() => {});
  }
}
