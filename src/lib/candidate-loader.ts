/**
 * candidate-loader.ts
 *
 * DynamoDB is the single source of truth for candidate CV and profile data.
 * Run `npm run dynamo:init` once to seed from cv.md / config/profile.yml.
 *
 * loadCandidateContext() — used by the evaluate CLI.
 *   Reads CV + Profile from DynamoDB and serializes them to the string format
 *   that buildPrompt() expects. Throws if either record is missing.
 *
 * cvToMarkdown() / profileToYaml() — exported for scripts/get-cv.ts, get-profile.ts.
 */

import { getCV, type CV } from "./cv-store.js";
import { getProfile, type Profile } from "./profile-store.js";
import { TABLE_CV, TABLE_PROFILE } from "./dynamo.js";
import { log } from "./logger.js";

export interface CandidateContext {
  cv: string;
  profileYml: string;
}

// ─── Public loader ────────────────────────────────────────────────────────────

/**
 * Load CV + Profile from DynamoDB for a specific user and return them as
 * prompt-ready strings. Throws with an actionable message if either record
 * is not found.
 *
 * @param userId — the user whose CV + Profile to load
 */
export async function loadCandidateContext(userId: string): Promise<CandidateContext> {
  const [cvRecord, profileRecord] = await Promise.all([getCV(userId), getProfile(userId)]);

  if (!cvRecord || !profileRecord) {
    const missing = [!cvRecord && "CV", !profileRecord && "Profile"]
      .filter(Boolean)
      .join(" and ");
    throw new Error(
      `DynamoDB is missing: ${missing}.\n` +
        `CV table: "${TABLE_CV}", Profile table: "${TABLE_PROFILE}".\n` +
        `Run \`npm run dynamo:init\` to create and seed both tables.`,
    );
  }

  log.info("📦 CV + Profile loaded from DynamoDB");
  return {
    cv: cvToMarkdown(cvRecord, profileRecord.candidate.full_name),
    profileYml: profileToYaml(profileRecord),
  };
}

// ─── CV → Markdown ────────────────────────────────────────────────────────────

/**
 * Serialize a CV record to Markdown (mirrors the cv.md format).
 * Exported so `scripts/get-cv.ts` can print it to stdout for AI agents.
 */
export function cvToMarkdown(cv: CV, candidateName?: string): string {
  const lines: string[] = [];

  if (candidateName) lines.push(`# ${candidateName}`, "");

  if (cv.summary) {
    lines.push("## Professional Summary", "", cv.summary, "");
    lines.push("---", "");
  }

  if (cv.skills?.length) {
    lines.push("## Skills", "");
    for (const group of cv.skills)
      lines.push(`* **${group.category}:** ${group.items.join(", ")}`);
    lines.push("", "---", "");
  }

  if (cv.experience?.length) {
    lines.push("## Experience", "");
    for (const exp of cv.experience) {
      lines.push(`### ${exp.company}`);
      lines.push(`**${exp.role}** | ${exp.location}`);
      lines.push(`*${exp.period}*`);
      for (const h of exp.highlights) lines.push(`* ${h}`);
      lines.push("");
    }
    lines.push("---", "");
  }

  if (cv.education?.length) {
    lines.push("## Education", "");
    for (const edu of cv.education) {
      lines.push(`### ${edu.institution}`);
      const degreeLabel = edu.field ? `${edu.degree} (${edu.field})` : edu.degree;
      lines.push(`**${degreeLabel}** | ${edu.location}`);
      lines.push(`*${edu.period}*`);
      lines.push("");
    }
    lines.push("---", "");
  }

  if (cv.certifications?.length) {
    lines.push("## Certifications", "");
    for (const cert of cv.certifications) {
      const extra = [cert.issuer, cert.date].filter(Boolean).join(" · ");
      lines.push(`* ${cert.name}${extra ? ` — ${extra}` : ""}`);
    }
    lines.push("", "---", "");
  }

  if (cv.languages?.length) {
    lines.push("## Languages", "");
    for (const lang of cv.languages) lines.push(`* **${lang.name}:** ${lang.proficiency}`);
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Profile → YAML ───────────────────────────────────────────────────────────

/**
 * Serialize a Profile record to YAML (mirrors config/profile.yml format).
 * Exported so `scripts/get-profile.ts` can print it to stdout for AI agents.
 */
export function profileToYaml(profile: Profile): string {
  const lines: string[] = [];

  lines.push("candidate:");
  const c = profile.candidate;
  lines.push(`  full_name: "${c.full_name}"`);
  lines.push(`  email: "${c.email}"`);
  lines.push(`  phone: "${c.phone}"`);
  lines.push(`  location: "${c.location}"`);
  lines.push(`  linkedin: "${c.linkedin}"`);
  lines.push(`  portfolio_url: "${c.portfolio_url}"`);
  lines.push(`  github: "${c.github}"`);
  if (c.twitter) lines.push(`  twitter: "${c.twitter}"`);
  lines.push("");

  lines.push("target_roles:");
  lines.push("  primary:");
  for (const r of profile.target_roles.primary) lines.push(`    - "${r}"`);
  lines.push("  archetypes:");
  for (const a of profile.target_roles.archetypes) {
    lines.push(`    - name: "${a.name}"`);
    lines.push(`      level: "${a.level}"`);
    lines.push(`      fit: "${a.fit}"`);
  }
  lines.push("");

  lines.push("narrative:");
  const n = profile.narrative;
  lines.push(`  headline: "${n.headline}"`);
  lines.push(`  exit_story: "${n.exit_story}"`);
  lines.push("  superpowers:");
  for (const s of n.superpowers) lines.push(`    - "${s}"`);
  lines.push("  proof_points:");
  for (const p of n.proof_points) {
    lines.push(`    - name: "${p.name}"`);
    if (p.url) lines.push(`      url: "${p.url}"`);
    lines.push(`      hero_metric: "${p.hero_metric}"`);
  }
  lines.push("");

  lines.push("compensation:");
  const comp = profile.compensation;
  lines.push(`  target_range: "${comp.target_range}"`);
  lines.push(`  currency: "${comp.currency}"`);
  lines.push(`  minimum: "${comp.minimum}"`);
  lines.push(`  location_flexibility: "${comp.location_flexibility}"`);
  lines.push("");

  lines.push("location:");
  const loc = profile.location;
  lines.push(`  country: "${loc.country}"`);
  lines.push(`  city: "${loc.city}"`);
  lines.push(`  timezone: "${loc.timezone}"`);
  lines.push(`  visa_status: "${loc.visa_status}"`);
  if (loc.onsite_availability) lines.push(`  onsite_availability: "${loc.onsite_availability}"`);

  return lines.join("\n");
}
