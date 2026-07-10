/**
 * DynamoDB store for candidate profile data — multi-tenant.
 *
 * Table layout (single-table design):
 *   PK = "PROFILE#<userId>"   SK = "v1"
 *
 * Each user's profile is an independent partition. The userId-prefixed PK gives
 * good key distribution at scale (no hot-partition risk) and keeps all profile
 * operations O(1) regardless of total user count.
 */

import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_PROFILE as TABLE } from "./dynamo.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CandidateIdentity {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  portfolio_url: string;
  github: string;
  twitter?: string;
}

export interface RoleArchetype {
  name: string;
  level: string;
  fit: "primary" | "secondary" | "adjacent";
}

export interface TargetRoles {
  primary: string[];
  archetypes: RoleArchetype[];
}

export interface ProofPoint {
  name: string;
  url?: string;
  hero_metric: string;
}

export interface Narrative {
  headline: string;
  exit_story: string;
  superpowers: string[];
  proof_points: ProofPoint[];
}

export interface Compensation {
  target_range: string;
  currency: string;
  minimum: string;
  location_flexibility: string;
}

export interface LocationPrefs {
  country: string;
  city: string;
  timezone: string;
  visa_status: string;
  onsite_availability?: string;
}

/**
 * Per-user job-matching preferences consumed by the scan matchers
 * (src/lib/matching.ts). Every list is a set of plain keywords/phrases that
 * are compiled into case-insensitive word-boundary regexes at scan time, so
 * each user's scan is driven entirely by their own profile — nothing is
 * hardcoded for a single candidate.
 *
 * Empty "include"-style lists mean "no restriction"; empty "exclude"-style
 * lists mean "exclude nothing".
 */
export interface MatchingPrefs {
  /** User's visa status (e.g., "citizen", "needs sponsorship"). */
  visa_status?: string;
  /** Discipline keywords that mark a title as in-scope (e.g. "software", "backend", "ml"). */
  role_domains: string[];
  /** Role nouns combined with the domains (e.g. "engineer", "developer", "architect"). */
  role_nouns: string[];
  /** Full title phrases that always count as in-scope (e.g. "solutions engineer"). */
  include_titles: string[];
  /** Keywords that disqualify a title regardless of other matches (e.g. "sales", "recruiter"). */
  exclude_titles: string[];
  /** Title keywords that mark a role as a strong match for the high-signal shortlist. */
  strong_titles: string[];
  /** Seniority keywords to reject (e.g. "senior", "staff"). Empty = no seniority ceiling. */
  seniority_exclusions: string[];
  /** Location keywords where the candidate can work (cities, regions, countries). */
  preferred_locations: string[];
  /** Whether remote roles are acceptable. */
  remote_ok: boolean;
  /** Countries where the candidate is eligible to work (optional). */
  eligible_locations?: string[];
}

export interface Profile {
  candidate: CandidateIdentity;
  target_roles: TargetRoles;
  narrative: Narrative;
  compensation: Compensation;
  location: LocationPrefs;
  matching?: MatchingPrefs;
  updatedAt?: string;
}

// ─── Keys ────────────────────────────────────────────────────────────────────

const pk = (userId: string) => `PROFILE#${userId}`;
const SK = "v1";

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Read the stored profile for a user. Returns null if not yet seeded.
 * Throws with an actionable message if the table does not exist.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  try {
    const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: pk(userId), SK } }));
    if (!res.Item) return null;
    const { PK: _pk, SK: _sk, ...profile } = res.Item;
    return profile as Profile;
  } catch (err) {
    const name = (err as { name?: string }).name ?? "";
    if (name === "ResourceNotFoundException") {
      throw new Error(
        `DynamoDB table "${TABLE}" (Profile) does not exist. Run \`npm run dynamo:init\` to create and seed it.`,
      );
    }
    throw err;
  }
}

/**
 * Write (upsert) the full profile for a user. Overwrites any existing record.
 */
export async function putProfile(userId: string, profile: Profile): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: pk(userId),
        SK,
        ...profile,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
}

/**
 * Patch individual top-level fields of the profile without rewriting the whole record.
 */
export async function patchProfile(
  userId: string,
  fields: Partial<Omit<Profile, "updatedAt">>,
): Promise<void> {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (keys.length === 0) return;

  const expr = keys.map((_k, i) => `#f${i} = :v${i}`).join(", ");
  const names = Object.fromEntries(keys.map((k, i) => [`#f${i}`, k as string]));
  const values = Object.fromEntries(keys.map((k, i) => [`:v${i}`, fields[k]])) as Record<
    string,
    unknown
  >;
  values[":ts"] = new Date().toISOString();

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: pk(userId), SK },
      UpdateExpression: `SET ${expr}, updatedAt = :ts`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}
