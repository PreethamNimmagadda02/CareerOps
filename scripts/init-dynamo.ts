/**
 * scripts/init-dynamo.ts
 *
 * Creates two DynamoDB tables and seeds them:
 *   careerops-cv      ← from cv.md
 *   careerops-profile ← from config/profile.yml
 *
 * Usage:
 *   npm run dynamo:init          # create tables + seed data
 *   npm run dynamo:init:dry      # print what would be written, no writes
 *
 * Idempotent: skips table creation if it already exists.
 */

import { CreateTableCommand, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";

import "dotenv/config";

import { ddb, TABLE_CV, TABLE_PROFILE } from "../src/lib/dynamo.js";
import { putProfile, type Profile } from "../src/lib/profile-store.js";
import { putCV, type CV } from "../src/lib/cv-store.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry");

function log(msg: string) {
  console.log(`[dynamo:init] ${msg}`);
}

// ─── 0. Wait for DynamoDB to be ready ────────────────────────────────────────

async function waitForDynamo(maxRetries = 30, delayMs = 2000): Promise<void> {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      await ddb.send(new ListTablesCommand({}));
      log("DynamoDB is ready.");
      return;
    } catch {
      log(`Waiting for DynamoDB... (${i}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`DynamoDB did not become ready after ${maxRetries} attempts.`);
}

// ─── 1. Create a table (idempotent) ──────────────────────────────────────────

async function createTable(tableName: string) {
  try {
    await ddb.send(
      new CreateTableCommand({
        TableName: tableName,
        KeySchema: [
          { AttributeName: "PK", KeyType: "HASH" },
          { AttributeName: "SK", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "PK", AttributeType: "S" },
          { AttributeName: "SK", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    log(`Table "${tableName}" created.`);
  } catch (err) {
    const name = (err as { name?: string }).name ?? "";
    if (name.includes("ResourceInUseException") || name.includes("ResourceInExistsException")) {
      log(`Table "${tableName}" already exists — skipping.`);
    } else {
      throw err;
    }
  }
}

// ─── 2. Seed profile from profile.yml ────────────────────────────────────────

async function seedProfile() {
  const ymlPath = path.join(ROOT, "config", "profile.yml");
  if (!fs.existsSync(ymlPath)) {
    log("config/profile.yml not found — skipping profile seed.");
    return;
  }

  let profile: Profile;
  try {
    const { default: yaml } = await import("js-yaml").catch(() => ({ default: null }));
    if (yaml) {
      profile = yaml.load(fs.readFileSync(ymlPath, "utf-8")) as Profile;
    } else {
      profile = buildProfileFromYml(fs.readFileSync(ymlPath, "utf-8"));
    }
  } catch {
    profile = buildProfileFromYml(fs.readFileSync(ymlPath, "utf-8"));
  }

  if (DRY) {
    log(`DRY: would write to "${TABLE_PROFILE}" —`);
    console.log(JSON.stringify(profile, null, 2));
    return;
  }

  await putProfile(profile);
  log(`Profile seeded → "${TABLE_PROFILE}".`);
}

function buildProfileFromYml(raw: string): Profile {
  const lines = raw.split("\n");
  function val(key: string): string {
    const line = lines.find((l) => l.trimStart().startsWith(`${key}:`));
    if (!line) return "";
    return line.split(":").slice(1).join(":").trim().replace(/^"|"$/g, "");
  }
  function listAfter(key: string): string[] {
    const start = lines.findIndex((l) => l.trimStart().startsWith(`${key}:`));
    if (start === -1) return [];
    const result: string[] = [];
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.trimStart().startsWith("- ")) {
        result.push(l.trimStart().slice(2).trim().replace(/^"|"$/g, ""));
      } else if (l.trim() === "" || /^\w/.test(l)) {
        break;
      }
    }
    return result;
  }

  return {
    candidate: {
      full_name: val("full_name"),
      email: val("email"),
      phone: val("phone"),
      location: val("location"),
      linkedin: val("linkedin"),
      portfolio_url: val("portfolio_url"),
      github: val("github"),
      twitter: val("twitter") || undefined,
    },
    target_roles: { primary: listAfter("primary"), archetypes: [] },
    narrative: {
      headline: val("headline"),
      exit_story: val("exit_story"),
      superpowers: listAfter("superpowers"),
      proof_points: [],
    },
    compensation: {
      target_range: val("target_range"),
      currency: val("currency"),
      minimum: val("minimum"),
      location_flexibility: val("location_flexibility"),
    },
    location: {
      country: val("country"),
      city: val("city"),
      timezone: val("timezone"),
      visa_status: val("visa_status"),
    },
  };
}

// ─── 3. Seed CV from cv.md ────────────────────────────────────────────────────

async function seedCV() {
  const cvPath = path.join(ROOT, "cv.md");
  if (!fs.existsSync(cvPath)) {
    log("cv.md not found — skipping CV seed.");
    return;
  }

  const raw = fs.readFileSync(cvPath, "utf-8");
  const cv = parseCvMarkdown(raw);

  if (DRY) {
    log(`DRY: would write to "${TABLE_CV}" —`);
    console.log(JSON.stringify(cv, null, 2));
    return;
  }

  await putCV(cv);
  log(`CV seeded → "${TABLE_CV}".`);
}

function parseCvMarkdown(md: string): CV {
  const lines = md.split("\n");

  function sectionLines(heading: string): string[] {
    const start = lines.findIndex(
      (l) => l.startsWith("## ") && l.toLowerCase().includes(heading.toLowerCase()),
    );
    if (start === -1) return [];
    const result: string[] = [];
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].startsWith("## ")) break;
      result.push(lines[i]);
    }
    return result;
  }

  const summary = sectionLines("Professional Summary")
    .filter((l) => l.trim() && !l.startsWith("---"))
    .join(" ")
    .trim();

  const skills = sectionLines("Skills")
    .filter((l) => l.trim().startsWith("*"))
    .map((l) => {
      const content = l.replace(/^\*\s*/, "").replace(/\*\*/g, "");
      const colonIdx = content.indexOf(":");
      if (colonIdx === -1) return { category: "General", items: [content.trim()] };
      return {
        category: content.slice(0, colonIdx).trim(),
        items: content.slice(colonIdx + 1).split(",").map((s) => s.trim()).filter(Boolean),
      };
    });

  const experience = parseExperience(sectionLines("Experience"));
  const education  = parseEducation(sectionLines("Education"));

  const certifications = sectionLines("Certifications")
    .filter((l) => l.trim().startsWith("*"))
    .map((l) => ({ name: l.replace(/^\*\s*/, "").trim() }));

  const languages = sectionLines("Languages")
    .filter((l) => l.trim().startsWith("*"))
    .map((l) => {
      const content = l.replace(/^\*\s*/, "").replace(/\*\*/g, "");
      const parts = content.split(":");
      return { name: parts[0]?.trim() ?? "", proficiency: parts[1]?.trim() ?? "" };
    });

  return { summary, skills, experience, education, certifications, languages };
}

function parseExperience(lines: string[]) {
  const entries: { company: string; role: string; location: string; period: string; highlights: string[] }[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith("### ")) {
      const company  = lines[i].replace("### ", "").trim();
      const role     = (lines[i + 1] ?? "").replace(/^\*\*/, "").split("**")[0].trim();
      const location = (lines[i + 1] ?? "").split("|")[1]?.trim() ?? "";
      const period   = (lines[i + 2] ?? "").replace(/^\*/, "").replace(/\*$/, "").trim();
      const highlights: string[] = [];
      let j = i + 3;
      while (j < lines.length && !lines[j].startsWith("### ")) {
        if (lines[j].trim().startsWith("*")) highlights.push(lines[j].replace(/^\*\s*/, "").trim());
        j++;
      }
      entries.push({ company, role, location, period, highlights });
      i = j;
    } else { i++; }
  }
  return entries;
}

function parseEducation(lines: string[]) {
  const entries: { institution: string; degree: string; field: string; location: string; period: string }[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith("### ")) {
      const institution = lines[i].replace("### ", "").trim();
      const degreeRaw   = (lines[i + 1] ?? "").replace(/^\*\*/, "").split("**")[0].trim();
      const [degree, field] = degreeRaw.includes("(")
        ? [degreeRaw.split("(")[0].trim(), degreeRaw.match(/\(([^)]+)\)/)?.[1] ?? ""]
        : [degreeRaw, ""];
      const location = (lines[i + 1] ?? "").split("|")[1]?.trim() ?? "";
      const period   = (lines[i + 2] ?? "").replace(/^\*/, "").replace(/\*$/, "").trim();
      entries.push({ institution, degree, field, location, period });
      i += 3;
    } else { i++; }
  }
  return entries;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log(`CV table      : "${TABLE_CV}"`);
  log(`Profile table : "${TABLE_PROFILE}"`);
  log(`Endpoint      : ${process.env.DYNAMODB_ENDPOINT ?? "real AWS"}`);
  if (DRY) log("DRY RUN — no writes will be performed.");

  await waitForDynamo();

  if (!DRY) {
    await createTable(TABLE_CV);
    await createTable(TABLE_PROFILE);
  }

  await seedProfile();
  await seedCV();

  log("Done.");
}

main().catch((err) => {
  console.error("[dynamo:init] FATAL:", err);
  process.exit(1);
});
