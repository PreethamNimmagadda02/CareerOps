/**
 * DynamoDB store for candidate profile data.
 *
 * Table layout (single-table design):
 *   PK = "PROFILE"   SK = "v1"
 *
 * The shape mirrors config/profile.yml so the profile can be seeded from that
 * file and later edited/updated programmatically.
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

export interface Profile {
  candidate: CandidateIdentity;
  target_roles: TargetRoles;
  narrative: Narrative;
  compensation: Compensation;
  location: LocationPrefs;
  updatedAt?: string;
}

// ─── Keys ────────────────────────────────────────────────────────────────────

const PK = "PROFILE";
const SK = "v1";

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Read the stored profile. Returns null if not yet seeded.
 * Throws with an actionable message if the table does not exist.
 */
export async function getProfile(): Promise<Profile | null> {
  try {
    const res = await ddb.send(
      new GetCommand({ TableName: TABLE, Key: { PK, SK } }),
    );
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
 * Write (upsert) the full profile. Overwrites any existing record.
 */
export async function putProfile(profile: Profile): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK,
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
  fields: Partial<Omit<Profile, "updatedAt">>,
): Promise<void> {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (keys.length === 0) return;

  const expr = keys.map((_k, i) => `#f${i} = :v${i}`).join(", ");
  const names = Object.fromEntries(keys.map((k, i) => [`#f${i}`, k as string]));
  const values = Object.fromEntries(
    keys.map((k, i) => [`:v${i}`, fields[k]]),
  ) as Record<string, unknown>;
  values[":ts"] = new Date().toISOString();

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK, SK },
      UpdateExpression: `SET ${expr}, updatedAt = :ts`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}
