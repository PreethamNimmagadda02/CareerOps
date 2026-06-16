import fs from "fs";
import { chromium } from "/Users/preethamnimmagadda/Desktop/CarrerOps/node_modules/playwright/index.mjs";

const root = "/Users/preethamnimmagadda/Desktop/CarrerOps";
const portalsPath = `${root}/portals.yml`;
const pipelinePath = `${root}/data/pipeline.md`;
const applicationsPath = `${root}/data/applications.md`;
const scanHistoryPath = `${root}/data/scan-history.tsv`;

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const CONCURRENCY = args.includes("--concurrency")
  ? Number(args[args.indexOf("--concurrency") + 1])
  : 8;
const BROWSER_CONCURRENCY = args.includes("--browser-concurrency")
  ? Number(args[args.indexOf("--browser-concurrency") + 1])
  : 3;

const portals = fs.readFileSync(portalsPath, "utf8");

function unquote(value) {
  return value.trim().replace(/^["']|["']$/g, "");
}

function parseConfig(text) {
  const lines = text.split(/\r?\n/);
  let section = null;
  let filterKey = null;
  const positive = [];
  const negative = [];
  const companies = [];
  let current = null;

  for (const line of lines) {
    if (/^title_filter:/.test(line)) section = "filter";
    if (/^search_queries:/.test(line)) {
      section = "queries";
      filterKey = null;
    }
    if (/^tracked_companies:/.test(line)) {
      section = "companies";
      filterKey = null;
    }

    if (section === "filter") {
      const key = line.match(/^\s{2}(positive|negative):/);
      if (key) filterKey = key[1];
      const item = line.match(/^\s{4}-\s+(.+)$/);
      if (item && filterKey === "positive") positive.push(unquote(item[1]));
      if (item && filterKey === "negative") negative.push(unquote(item[1]));
    }

    if (section === "companies") {
      const name = line.match(/^\s{2}-\s+name:\s+(.+)$/);
      if (name) {
        if (current) companies.push(current);
        current = { name: unquote(name[1]) };
        continue;
      }
      if (!current) continue;
      const prop = line.match(/^\s{4}([a-zA-Z_]+):\s+(.+)$/);
      if (prop) current[prop[1]] = unquote(prop[2]);
    }
  }
  if (current) companies.push(current);
  return { positive, negative, companies };
}

function slugFromAshby(url) {
  const match = url?.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function slugFromLever(url) {
  const match = url?.match(/jobs\.lever\.co\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function normalizeUrl(url) {
  return String(url || "").replace(/\?.*$/, "").replace(/\/$/, "").toLowerCase();
}

function keywordMatch(lower, keyword) {
  const kw = keyword.toLowerCase();
  if (kw === "ai" || kw === "ml") return new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`).test(lower);
  return lower.includes(kw);
}

function titleMatches(title, positive, negative) {
  const lower = title.toLowerCase();
  const pos = positive.find((kw) => keywordMatch(lower, kw));
  const neg = negative.find((kw) => keywordMatch(lower, kw));
  return { relevant: Boolean(pos) && !neg, positive: pos || "", negative: neg || "" };
}

function engineeringMatch(title) {
  const lower = title.toLowerCase();
  const include =
    /\b(software|backend|frontend|front-end|fullstack|full-stack|platform|infrastructure|devops|sre|site reliability|security|data platform|systems|compute|distributed systems|mlops|llmops|machine learning|ml|ai|applied ai|forward deployed|deployed|solutions|solution|customer|implementation|integration|automation)\b/.test(lower) &&
    /\b(engineer|engineering|architect|developer)\b/.test(lower);
  const explicitInclude =
    /\b(forward deployed engineer|forward deployed software engineer|deployed engineer|deployment engineer|solutions engineer|solution engineer|solutions architect|solution architect|customer engineer|implementation engineer|integration engineer|automation engineer|ai engineer|applied ai engineer|ml engineer|machine learning engineer|llm engineer|backend engineer|software engineer|platform engineer|infrastructure engineer|devops engineer|security engineer|fullstack engineer|full-stack engineer|frontend engineer|front-end engineer)\b/.test(lower);
  const exclude =
    /\b(account executive|sales|pre-sales|presales|marketing|product marketing|growth marketing|recruiter|recruiting|talent|people|hr|legal|counsel|finance|accounting|trainer|assistant|compliance officer|program manager|project manager|product manager|strategist|strategy|researcher|research scientist|scientist|data scientist|analyst|customer success|support engineer|technical support|solutions consultant|solution consultant|consultant|evangelist|advocate|writer|designer|design engineer|field cto|cto|chief|operations|ops manager)\b/.test(lower);
  return { engineering: (include || explicitInclude) && !exclude, excluded: exclude };
}

function locationMatch(location) {
  const lower = String(location || "").toLowerCase();
  const india = /\b(india|bangalore|bengaluru|hyderabad|mumbai|pune|delhi|gurgaon|gurugram|noida|chennai|kolkata|ahmedabad|apac)\b/.test(lower);
  const remote = /\b(remote|remote-first|work from home|wfh|distributed)\b/.test(lower);
  const foreignStrict = /\b(us|usa|united states|uk|united kingdom|canada|europe|eu|germany|france|spain|london|berlin|paris|amsterdam|sf|san francisco|new york|nyc|ca|ny|tx|wa|seattle|austin|boston|chicago|toronto|vancouver)\b/.test(lower);
  const eligible = india || (remote && (!foreignStrict || india));
  return { eligible, india, remote };
}

function isHighSignal(job) {
  const title = job.title.toLowerCase();
  const location = job.location.toLowerCase();
  const strongTitle =
    /(forward deployed|deployed engineer|deployment engineer|solutions architect|solutions engineer|software engineer|backend engineer|platform engineer|full.?stack|machine learning|ml engineer|llm|agent|agentic|generative ai|ai engineer|automation)/i.test(job.title);
  const weakTitle =
    /(account executive|sales|marketing|recruit|talent|legal|finance|trainer|assistant|compliance officer|program manager|product manager|data scientist|scientist|researcher)/i.test(job.title);
  const friendlyLocation =
    /(remote|india|hyderabad|bengaluru|bangalore|mumbai|pune|delhi|gurgaon|noida|chennai|kolkata|ahmedabad|apac|singapore)/i.test(job.location || "");
  const likelyTooSenior = /(staff|principal|lead|senior|manager|director|head)/i.test(job.title);
  return engineeringMatch(job.title).engineering && strongTitle && !weakTitle && friendlyLocation && !likelyTooSenior;
}

function dedupKey(company, title) {
  return `${company} ${title}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 16000);
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

async function scanCompany(company) {
  const jobs = [];
  const source = company.api
    ? company.api
    : slugFromAshby(company.careers_url)
      ? `https://api.ashbyhq.com/posting-api/job-board/${slugFromAshby(company.careers_url)}`
      : slugFromLever(company.careers_url)
        ? `https://api.lever.co/v0/postings/${slugFromLever(company.careers_url)}?mode=json`
        : null;

  if (!source) return { company, method: "unsupported", jobs, error: "" };

  try {
    const data = await fetchJson(source);
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
    return { company, method: source.includes("ashby") ? "ashby" : source.includes("lever") ? "lever" : "greenhouse", jobs, error: err.message };
  }
}

async function scanCompanyBrowser(browser, company) {
  if (!company.careers_url) return { company, method: "browser", jobs: [], error: "missing careers_url" };
  const page = await browser.newPage();
  try {
    await page.goto(company.careers_url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(3500);
    const jobs = await page.evaluate((companyName) => {
      const words = /(engineer|architect|developer|machine learning|software|backend|platform|solutions|forward deployed|deployed|ai|ml|llm|agent|automation)/i;
      const bad = /(privacy|terms|cookie|linkedin|instagram|facebook|twitter|youtube|blog|about|contact|login|sign in)/i;
      const rows = [];
      for (const anchor of document.querySelectorAll("a[href]")) {
        const href = new URL(anchor.getAttribute("href"), location.href).href;
        const text = (anchor.textContent || "").replace(/\s+/g, " ").trim();
        const parentText = (anchor.closest("li, article, tr, div")?.textContent || text).replace(/\s+/g, " ").trim();
        const title = text.length >= 8 ? text : parentText.slice(0, 140);
        if (!title || title.length < 8 || title.length > 180) continue;
        if (bad.test(title) || bad.test(href)) continue;
        if (!words.test(title) && !/(job|career|greenhouse|ashby|lever|workable|workday|apply)/i.test(href)) continue;
        rows.push({
          company: companyName,
          title,
          url: href,
          location: parentText.replace(title, "").trim().slice(0, 120),
          source: location.href,
        });
      }
      const seen = new Set();
      return rows.filter((row) => {
        const key = `${row.url} ${row.title}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 80);
    }, company.name);
    return { company, method: "browser", jobs, error: "" };
  } catch (err) {
    return { company, method: "browser", jobs: [], error: err.message };
  } finally {
    await page.close().catch(() => {});
  }
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let index = 0;
  async function worker() {
    for (;;) {
      const next = index++;
      if (next >= items.length) return;
      out[next] = await fn(items[next]);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return out;
}

const config = parseConfig(portals);
const enabledCompanies = config.companies.filter((company) => company.enabled !== "false");
const dedupText = [
  fs.existsSync(pipelinePath) ? fs.readFileSync(pipelinePath, "utf8") : "",
  fs.existsSync(applicationsPath) ? fs.readFileSync(applicationsPath, "utf8") : "",
  fs.existsSync(scanHistoryPath) ? fs.readFileSync(scanHistoryPath, "utf8") : "",
].join("\n").toLowerCase();
const seenUrls = new Set(
  dedupText
    .match(/https?:\/\/[^\s|)]+/g)
    ?.map(normalizeUrl) || [],
);

const structuredCompanies = enabledCompanies.filter(
  (company) => company.api || slugFromAshby(company.careers_url) || slugFromLever(company.careers_url),
);
const unsupportedCompanies = enabledCompanies.filter((company) => !structuredCompanies.includes(company));
const results = await mapLimit(structuredCompanies, CONCURRENCY, scanCompany);
let browserResults = [];
if (process.argv.includes("--fallback")) {
  const fallbackCompanies = [
    ...unsupportedCompanies,
    ...results.filter((result) => result.error).map((result) => result.company),
  ];
  console.log(`\n🚀 scan   concurrency=${CONCURRENCY}  browser-concurrency=${BROWSER_CONCURRENCY}`);
  const browser = await chromium.launch({ headless: true });
  try {
    browserResults = await mapLimit(fallbackCompanies, BROWSER_CONCURRENCY, (company) => scanCompanyBrowser(browser, company));
  } finally {
    await browser.close();
  }
}
const allResults = [...results, ...browserResults];
const jobs = allResults.flatMap((result) => result.jobs);
const structuredFailures = results.filter((result) => result.error);
const browserFailures = browserResults.filter((result) => result.error);
const relevant = [];
const skippedTitle = [];
const skippedNonEngineering = [];
const skippedLocation = [];
const duplicates = [];
const seenInRun = new Set();

for (const job of jobs) {
  const title = job.title || "";
  const match = titleMatches(title, config.positive, config.negative);
  const urlKey = normalizeUrl(job.url);
  const key = `${urlKey} ${dedupKey(job.company, title)}`;
  if (!match.relevant) {
    skippedTitle.push({ ...job, match });
    continue;
  }
  const eng = engineeringMatch(title);
  if (!eng.engineering) {
    skippedNonEngineering.push({ ...job, match, engineeringMatch: eng });
    continue;
  }
  const loc = locationMatch(job.location);
  if (!loc.eligible) {
    skippedLocation.push({ ...job, match, engineeringMatch: eng, locationMatch: loc });
    continue;
  }
  if (seenUrls.has(urlKey) || dedupText.includes(dedupKey(job.company, title)) || seenInRun.has(key)) {
    duplicates.push({ ...job, match });
    continue;
  }
  seenInRun.add(key);
  relevant.push({ ...job, match, engineeringMatch: eng, locationMatch: loc });
}

const summary = {
  scannedAt: new Date().toISOString(),
  enabledCompanies: enabledCompanies.length,
  structuredCompanies: structuredCompanies.length,
  unsupportedCompanies: unsupportedCompanies.map((company) => company.name),
  browserFallbackCompanies: browserResults.length,
  successfulCompanies: allResults.filter((result) => !result.error).length,
  structuredFailures: structuredFailures.map((result) => ({
    company: result.company.name,
    method: result.method,
    error: result.error,
  })),
  browserFailures: browserFailures.map((result) => ({
    company: result.company.name,
    method: result.method,
    error: result.error,
  })),
  failedCompanies: browserResults.length
    ? browserFailures.map((result) => ({
        company: result.company.name,
        method: result.method,
        error: result.error,
      }))
    : structuredFailures.map((result) => ({
        company: result.company.name,
        method: result.method,
        error: result.error,
      })),
  totalJobs: jobs.length,
  engineeringRelevant: relevant.length,
  relevantNew: relevant.length,
  relevantDuplicates: duplicates.length,
  skippedTitle: skippedTitle.length,
  skippedNonEngineering: skippedNonEngineering.length,
  skippedLocation: skippedLocation.length,
  relevant,
  shortlist: relevant.filter(isHighSignal).slice(0, 80),
};

fs.writeFileSync("/private/tmp/career-ops-scan-results.json", JSON.stringify(summary, null, 2));

if (summary.shortlist.length > 0) {
  const today = new Date().toISOString().slice(0, 10);
  let mdTable = `# Applications Tracker\n\n| # | Fecha | Empresa | Rol | Score | Estado | PDF | Report |\n|---|---|---|---|---|---|---|---|\n`;
  let id = 1;
  for (const job of summary.shortlist) {
    mdTable += `| ${id++} | ${today} | ${job.company} | ${job.title} | N/A | Evaluated | ❌ |  | Imported from recent scan (shortlist) |\n`;
  }
  fs.writeFileSync(applicationsPath, mdTable);
  console.log(`\nCompletely overwrote applications.md with ${summary.shortlist.length} shortlisted jobs.`);
}

if (process.argv.includes("--compact")) {
  const verbose = process.argv.includes("--verbose");
  const byCompany = new Map();
  for (const job of summary.shortlist) {
    if (!byCompany.has(job.company)) byCompany.set(job.company, []);
    byCompany.get(job.company).push(job);
  }
  console.log(`Portal Scan ${new Date().toISOString().slice(0, 10)}`);
  console.log(`Enabled companies: ${summary.enabledCompanies}`);
  console.log(`Structured boards scanned: ${summary.structuredCompanies}`);
  console.log(`Browser fallback boards attempted: ${browserResults.length}`);
  console.log(`Successful boards: ${summary.successfulCompanies}`);
  console.log(`Unrecovered failed boards: ${summary.failedCompanies.length}`);
  console.log(`Custom/non-API boards: ${summary.unsupportedCompanies.length}`);
  console.log(`Jobs fetched: ${summary.totalJobs}`);
  console.log(`India/remote engineering roles after filters: ${summary.engineeringRelevant}`);
  console.log(`Skipped non-engineering roles: ${summary.skippedNonEngineering}`);
  console.log(`Skipped non-India/non-remote roles: ${summary.skippedLocation}`);
  console.log(`High-signal shortlist: ${summary.shortlist.length}`);
  console.log("");
  for (const [company, jobs] of byCompany) {
    console.log(company);
    for (const job of jobs.slice(0, 8)) {
      console.log(`- ${job.title} | ${job.location || "Location not listed"} | ${job.url}`);
    }
  }
  console.log("");
  if (verbose && summary.structuredFailures.length) {
    console.log("Structured API failures recovered by browser fallback when --fallback is used:");
    for (const item of summary.structuredFailures) console.log(`- ${item.company}: ${item.error}`);
  }
  if (summary.browserFailures.length) {
    console.log("");
    console.log("Browser fallback failures:");
    for (const item of summary.browserFailures) console.log(`- ${item.company}: ${item.error}`);
  }
  if (!browserResults.length && summary.unsupportedCompanies.length) {
    console.log("");
    console.log("Run again with --fallback for these custom/non-API boards:");
    for (const company of summary.unsupportedCompanies) console.log(`- ${company}`);
  }
  console.log("");
  console.log("Full JSON: /private/tmp/career-ops-scan-results.json");
} else {
  console.log(JSON.stringify(summary, null, 2));
}
