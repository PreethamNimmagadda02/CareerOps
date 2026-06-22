import type { Browser } from "playwright";

import type { Company, Job, ScanResult } from "../types.js";

const FETCH_TIMEOUT_MS = 16_000;
const PAGE_TIMEOUT_MS = 25_000;

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

/** Whether a company can be scanned via a structured JSON API. */
export function hasStructuredApi(company: Company): boolean {
  return Boolean(
    company.api || slugFromAshby(company.careers_url) || slugFromLever(company.careers_url),
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

function resolveApiSource(company: Company): string | null {
  if (company.api) return company.api;
  const ashby = slugFromAshby(company.careers_url);
  if (ashby) return `https://api.ashbyhq.com/posting-api/job-board/${ashby}`;
  const lever = slugFromLever(company.careers_url);
  if (lever) return `https://api.lever.co/v0/postings/${lever}?mode=json`;
  return null;
}

/** Scan a company via its structured job-board API (Greenhouse/Ashby/Lever). */
export async function scanCompany(company: Company): Promise<ScanResult> {
  const jobs: Job[] = [];
  const source = resolveApiSource(company);
  if (!source) return { company, method: "unsupported", jobs, error: "" };

  const method: ScanResult["method"] = source.includes("ashby")
    ? "ashby"
    : source.includes("lever")
      ? "lever"
      : "greenhouse";

  try {
    // The shape varies per provider; we defensively access optional fields.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await fetchJson(source)) as any;

    if (company.api) {
      for (const job of data.jobs || []) {
        jobs.push({
          company: company.name,
          title: job.title,
          url: job.absolute_url || job.url,
          location: (job.location?.name || "").trim(),
          source,
        });
      }
      return { company, method: "greenhouse", jobs, error: "" };
    }

    if (source.includes("ashbyhq.com")) {
      for (const job of data.jobs || []) {
        jobs.push({
          company: company.name,
          title: job.title,
          url: job.jobUrl || job.applyUrl || `${company.careers_url}/${job.id || ""}`,
          location: (job.location || job.locationName || "").trim(),
          source,
        });
      }
      return { company, method: "ashby", jobs, error: "" };
    }

    for (const job of data || []) {
      jobs.push({
        company: company.name,
        title: job.text,
        url: job.hostedUrl || job.applyUrl,
        location: (job.categories?.location || "").trim(),
        source,
      });
    }
    return { company, method: "lever", jobs, error: "" };
  } catch (err) {
    return { company, method, jobs, error: (err as Error).message };
  }
}

/** Scan a company by scraping its careers page DOM with a headless browser. */
export async function scanCompanyBrowser(browser: Browser, company: Company): Promise<ScanResult> {
  if (!company.careers_url) {
    return { company, method: "browser", jobs: [], error: "missing careers_url" };
  }
  const page = await browser.newPage();
  try {
    await page.goto(company.careers_url, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
    await page.waitForTimeout(3500);
    const jobs = await page.evaluate((companyName: string) => {
      const words =
        /(engineer|architect|developer|machine learning|software|backend|platform|solutions|forward deployed|deployed|ai|ml|llm|agent|automation)/i;
      const bad =
        /(privacy|terms|cookie|linkedin|instagram|facebook|twitter|youtube|blog|about|contact|login|sign in)/i;
      const rows: Job[] = [];
      for (const anchor of document.querySelectorAll("a[href]")) {
        const href = new URL(anchor.getAttribute("href") as string, location.href).href;
        const text = (anchor.textContent || "").replace(/\s+/g, " ").trim();
        const parentText = (anchor.closest("li, article, tr, div")?.textContent || text)
          .replace(/\s+/g, " ")
          .trim();
        const title = text.length >= 8 ? text : parentText.slice(0, 140);
        if (!title || title.length < 8 || title.length > 180) continue;
        if (bad.test(title) || bad.test(href)) continue;
        if (
          !words.test(title) &&
          !/(job|career|greenhouse|ashby|lever|workable|workday|apply)/i.test(href)
        )
          continue;
        rows.push({
          company: companyName,
          title,
          url: href,
          location: parentText.replace(title, "").trim().slice(0, 120),
          source: location.href,
        });
      }
      const seen = new Set<string>();
      return rows
        .filter((row) => {
          const key = `${row.url} ${row.title}`.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 80);
    }, company.name);
    return { company, method: "browser", jobs, error: "" };
  } catch (err) {
    return { company, method: "browser", jobs: [], error: (err as Error).message };
  } finally {
    await page.close().catch(() => {});
  }
}
