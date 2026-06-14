#!/usr/bin/env node
/**
 * evaluate-agent.mjs — Automated job evaluation agent
 *
 * Uses OpenCode Zen (or any OpenAI-compatible provider from your
 * opencode.jsonc) to automatically evaluate shortlisted N/A jobs
 * from data/applications.md, fetch each JD via Playwright, run
 * a structured A-F evaluation, write a report .md, and update
 * the tracker with a real score.
 *
 * Usage:
 *   node evaluate-agent.mjs                         # evaluate 5 jobs via Zen
 *   node evaluate-agent.mjs --limit 10              # process up to 10 jobs
 *   node evaluate-agent.mjs --job 3                 # evaluate only row #3
 *   node evaluate-agent.mjs --dry-run               # fetch JDs, skip AI + writes
 *   node evaluate-agent.mjs --provider zen          # OpenCode Zen
 *   node evaluate-agent.mjs --provider nvidia       # build.nvidia.com (default)
 *   node evaluate-agent.mjs --provider exo          # local MLX (Exo)
 *   node evaluate-agent.mjs --model gpt-5.5         # override model name
 *
 * Provider config is read from ~/.config/opencode/opencode.jsonc
 * Auth key:  OPENCODE_API_KEY env var  (or set in .env at project root)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "/Users/preethamnimmagadda/Desktop/CarrerOps/node_modules/playwright/index.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

// ── Paths ─────────────────────────────────────────────────────────────────────
const applicationsPath = path.join(root, "data/applications.md");
const scanResultsPath = "/private/tmp/career-ops-scan-results.json";
const cvPath = path.join(root, "cv.md");
const profilePath = path.join(root, "config/profile.yml");
const reportsDir = path.join(root, "reports");
const opencodeConfigPath = path.join(
  process.env.HOME, ".config/opencode/opencode.jsonc"
);

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = Number(args[args.indexOf("--limit") + 1] || 5);
const ONLY_ROW = args.includes("--job") ? Number(args[args.indexOf("--job") + 1]) : null;
const PROVIDER_ARG = args.includes("--provider") ? args[args.indexOf("--provider") + 1] : "nvidia";
const MODEL_ARG = args.includes("--model") ? args[args.indexOf("--model") + 1] : null;

// ── Load .env if present ──────────────────────────────────────────────────────
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

// ── Resolve provider config ───────────────────────────────────────────────────
// Built-in providers (always available, no API key needed for Zen if logged in)
const BUILTIN_PROVIDERS = {
  zen: {
    baseURL: "https://opencode.ai/zen/v1",
    defaultModel: "deepseek-v4-flash-free",
    authEnvVar: "OPENCODE_API_KEY",
  },
  nvidia: {
    baseURL: "https://integrate.api.nvidia.com/v1",
    defaultModel: "meta/llama-3.1-8b-instruct",
    authEnvVar: "NVIDIA_API_KEY",
  }
};

function loadOpencodeConfig() {
  if (!fs.existsSync(opencodeConfigPath)) return {};
  try {
    // Strip JSONC comments before parsing
    const raw = fs.readFileSync(opencodeConfigPath, "utf8")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    return JSON.parse(raw);
  } catch { return {}; }
}

function resolveProvider(providerArg) {
  // 1. Check built-ins first
  if (BUILTIN_PROVIDERS[providerArg]) {
    return BUILTIN_PROVIDERS[providerArg];
  }

  // 2. Look up from opencode.jsonc custom providers
  const cfg = loadOpencodeConfig();
  const p = cfg.provider?.[providerArg];
  if (p) {
    const models = Object.keys(p.models || {});
    return {
      baseURL: p.options?.baseURL,
      defaultModel: models[0] || "default",
      authEnvVar: "OPENCODE_API_KEY",
    };
  }

  console.error(`❌ Unknown provider "${providerArg}". Available: zen, exo, freemodel`);
  process.exit(1);
}

const provider = resolveProvider(PROVIDER_ARG);
const RESOLVED_MODEL = MODEL_ARG || provider.defaultModel;
const API_KEY = process.env[provider.authEnvVar] || process.env.OPENCODE_API_KEY || "dummy";

if (!API_KEY || API_KEY === "dummy") {
  if (!DRY_RUN && PROVIDER_ARG !== "exo") {
    // Exo (local) doesn't need a key; others warn but may still work
    console.warn(`⚠️  No API key found. Set ${provider.authEnvVar} in .env or env.`);
    console.warn(`   Get your key at: https://opencode.ai/auth  then run /connect in opencode\n`);
  }
}

console.log(`🤖 evaluate-agent`);
console.log(`   provider : ${PROVIDER_ARG}  (${provider.baseURL})`);
console.log(`   model    : ${RESOLVED_MODEL}`);
console.log(`   limit    : ${LIMIT}  dry-run=${DRY_RUN}\n`);

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAppLines(md) {
  const jobs = [];
  for (const line of md.split("\n")) {
    if (!line.startsWith("|")) continue;
    const parts = line.split("|").map((s) => s.trim());
    if (parts.length < 9) continue;
    const num = parseInt(parts[1]);
    if (isNaN(num) || num === 0) continue;
    jobs.push({
      num,
      date: parts[2],
      company: parts[3],
      role: parts[4],
      score: parts[5],
      status: parts[6],
      pdf: parts[7],
      report: parts[8],
      notes: parts[9] || "",
      raw: line,
    });
  }
  return jobs;
}

function buildUrlIndex(scanResultsPath) {
  if (!fs.existsSync(scanResultsPath)) return new Map();
  try {
    const data = JSON.parse(fs.readFileSync(scanResultsPath, "utf8"));
    const idx = new Map();
    for (const job of [...(data.shortlist || []), ...(data.relevant || [])]) {
      const key = normalizeKey(job.company, job.title);
      if (!idx.has(key)) idx.set(key, job.url);
    }
    return idx;
  } catch { return new Map(); }
}

function normalizeKey(company, title) {
  return `${company}||${title}`.toLowerCase().replace(/\s+/g, " ").trim();
}

function nextReportNumber() {
  if (!fs.existsSync(reportsDir)) { fs.mkdirSync(reportsDir, { recursive: true }); return 1; }
  const files = fs.readdirSync(reportsDir).filter((f) => /^\d{3}-/.test(f));
  if (!files.length) return 1;
  return Math.max(...files.map((f) => parseInt(f.split("-")[0]))) + 1;
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function today() { return new Date().toISOString().slice(0, 10); }

async function fetchJD(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    return await page.evaluate(() => {
      for (const el of document.querySelectorAll("script,style,nav,header,footer")) el.remove();
      return (document.body?.innerText || "")
        .replace(/\s{3,}/g, "\n\n").trim().slice(0, 8000);
    }) || "(Could not extract text)";
  } catch (err) {
    return `(JD fetch failed: ${err.message})`;
  } finally {
    await page.close().catch(() => { });
  }
}

function buildPrompt(cv, profileYml, jdText, company, role) {
  return `You are an expert career advisor evaluating a job opportunity for a candidate.

## CANDIDATE CV
${cv}

## CANDIDATE PROFILE
${profileYml}

## JOB: ${company} — ${role}
${jdText}

---

Produce a structured evaluation with EXACTLY these sections. Be specific — no fluff.

## ARCHETYPE
Classify the role: AI Platform/LLMOps | Agentic/Automation | AI Solutions Architect | AI Forward Deployed | AI Transformation | Software Engineering | Other
State archetype + 1-sentence reason.

## A) ROLE SUMMARY
| Field | Value |
|---|---|
| Archetype | ... |
| Domain | ... |
| Seniority | ... |
| Remote | ... |
| TL;DR | one sentence |

## B) CV MATCH
Map each key JD requirement to a specific line/project from the CV:
| JD Requirement | CV Evidence | Strength (Strong/Partial/Gap) |
|---|---|---|

**Gaps** subsection: list any hard blockers (no CV coverage) + mitigation.

## C) LEVEL & STRATEGY
- Detected seniority vs candidate's natural level for this archetype
- How to frame the application (specific phrases, proof points to lead with)
- If likely downleveled: acceptable and why?

## D) COMPENSATION
- Estimated salary range for this role + India/remote location
- Does it meet the candidate's target based on their profile?

## E) CV PERSONALIZATION (Top 5 changes)
| # | Section | Current | Proposed change | Why |
|---|---|---|---|---|

## F) INTERVIEW PREP (Top 5 STAR stories)
| # | JD Requirement | STAR Story | Result | Reflection |
|---|---|---|---|---|

## SCORE BREAKDOWN
Rate each dimension 1–5:
- Technical Fit: X/5 — reason
- Level Match: X/5 — reason
- Location/Remote: X/5 — reason
- Growth Potential: X/5 — reason
- Domain Fit: X/5 — reason

**OVERALL_SCORE: X.X/5**
(Tech 35% + Level 20% + Location 15% + Growth 15% + Domain 15%)

## RECOMMENDATION
APPLY NOW | APPLY WITH TWEAKS | MONITOR | SKIP — one sentence.`;
}

function parseScore(text) {
  const m = text.match(/OVERALL_SCORE:\s*([\d.]+)\/5/);
  return m ? parseFloat(m[1]).toFixed(1) : null;
}

function writeReport(num, company, role, url, evaluation) {
  const date = today();
  const filename = `${String(num).padStart(3, "0")}-${slugify(company)}-${date}.md`;
  const content = `# Evaluation: ${company} — ${role}\n\n**Date:** ${date}\n**URL:** ${url}\n**Provider:** ${PROVIDER_ARG} / ${RESOLVED_MODEL}\n**Report #:** ${num}\n\n---\n\n${evaluation}\n`;
  fs.writeFileSync(path.join(reportsDir, filename), content);
  return filename;
}

function updateTracker(mdLines, rawLine, score, reportNum, company, date) {
  const filename = `${String(reportNum).padStart(3, "0")}-${slugify(company)}-${date}.md`;
  const reportLink = `[${String(reportNum).padStart(3, "0")}](reports/${filename})`;
  const idx = mdLines.indexOf(rawLine);
  if (idx === -1) return false;
  const parts = rawLine.split("|");
  parts[5] = ` ${score}/5 `;
  parts[8] = ` ${reportLink} `;
  mdLines[idx] = parts.join("|");
  return true;
}

// ── OpenAI-compatible chat call ───────────────────────────────────────────────

async function callLLM(prompt) {
  const { default: OpenAI } = await import("openai").catch(() => {
    throw new Error("openai package not installed. Run: npm install openai");
  });

  const client = new OpenAI({
    apiKey: API_KEY,
    baseURL: provider.baseURL,
  });

  const resp = await client.chat.completions.create({
    model: RESOLVED_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 4096,
  });

  return resp.choices[0]?.message?.content || "";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(applicationsPath)) {
    console.error("❌ data/applications.md not found. Run: npm run scan:fallback");
    process.exit(1);
  }

  const cv = fs.readFileSync(cvPath, "utf8");
  const profileYml = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, "utf8") : "(profile.yml not found)";
  const mdContent = fs.readFileSync(applicationsPath, "utf8");
  const mdLines = mdContent.split("\n");
  const allJobs = parseAppLines(mdContent);

  // Filter: N/A score, no existing report
  let targets = allJobs.filter((j) => {
    const noScore = j.score.trim() === "N/A" || j.score.trim() === "";
    const noReport = !j.report.trim() || j.report.trim() === "";
    return noScore && noReport;
  });

  if (ONLY_ROW !== null) {
    targets = targets.filter((j) => j.num === ONLY_ROW);
    if (!targets.length) {
      console.error(`❌ Row #${ONLY_ROW} not found or already has a score/report.`);
      process.exit(1);
    }
  }

  targets = targets.slice(0, LIMIT);

  if (!targets.length) {
    console.log("✅ No pending N/A jobs to evaluate. All done!");
    process.exit(0);
  }

  console.log(`📋 ${targets.length} job(s) queued:\n`);
  for (const j of targets) console.log(`   #${j.num}  ${j.company} — ${j.role}`);
  console.log();

  const urlIndex = buildUrlIndex(scanResultsPath);
  const browser = await chromium.launch({ headless: true });
  const date = today();
  const results = { evaluated: 0, skipped: 0, errors: 0 };

  for (const job of targets) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`[#${job.num}] ${job.company} — ${job.role}`);

    // Resolve URL from scan results
    let url = urlIndex.get(normalizeKey(job.company, job.role));
    // Company-only fuzzy fallback
    if (!url) {
      for (const [k, v] of urlIndex) {
        if (k.startsWith(job.company.toLowerCase().replace(/\s+/g, " "))) { url = v; break; }
      }
    }

    if (!url) {
      console.warn(`   ⚠️  No URL in scan results — skipping. Re-run scan or use --job N with URL.`);
      results.skipped++;
      continue;
    }
    console.log(`   🔗 ${url}`);

    // Fetch JD text
    process.stdout.write("   📄 Fetching JD... ");
    const jdText = await fetchJD(browser, url);
    const fetchOk = !jdText.startsWith("(");
    console.log(`${fetchOk ? "✓" : "⚠️  partial"} (${jdText.length} chars)`);

    if (DRY_RUN) {
      console.log("   🧪 Dry-run: skipping AI call.");
      results.skipped++;
      continue;
    }

    // LLM evaluation
    process.stdout.write(`   🤖 Evaluating via ${PROVIDER_ARG}/${RESOLVED_MODEL}... `);
    let evaluation = "";
    try {
      const prompt = buildPrompt(cv, profileYml, jdText, job.company, job.role);
      evaluation = await callLLM(prompt);
      console.log("✓");
    } catch (err) {
      console.log(`❌ ${err.message}`);
      results.errors++;
      continue;
    }

    // Parse score
    const score = parseScore(evaluation);
    console.log(`   📊 Score: ${score ? score + "/5" : "could not parse — check report"}`);

    // Write report
    const reportNum = nextReportNumber();
    const filename = writeReport(reportNum, job.company, job.role, url, evaluation);
    console.log(`   📝 reports/${filename}`);

    // Update tracker
    const updated = updateTracker(mdLines, job.raw, score || "?", reportNum, job.company, date);
    if (updated) {
      fs.writeFileSync(applicationsPath, mdLines.join("\n"));
      console.log(`   ✅ Tracker → #${job.num} score=${score}/5  report=[${String(reportNum).padStart(3, "0")}]`);
    }

    results.evaluated++;
  }

  await browser.close();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 ${results.evaluated} evaluated  ${results.skipped} skipped  ${results.errors} errors`);
  if (results.evaluated > 0) {
    console.log(`📁 Reports  → ${reportsDir}/`);
    console.log(`📋 Tracker  → ${applicationsPath}`);
  }
}

main().catch((err) => {
  console.error("❌ Fatal:", err.message);
  process.exit(1);
});
