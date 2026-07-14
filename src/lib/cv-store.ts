/**
 * DynamoDB store for candidate CV data — multi-tenant.
 *
 * Table layout (single-table design):
 *   PK = "CV#<userId>"   SK = "v1"
 *
 * Each user's CV is an independent partition. The userId-prefixed PK gives
 * good key distribution at scale (no hot-partition risk) and keeps all CV
 * operations O(1) regardless of total user count.
 */

import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_CV as TABLE } from "./dynamo.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExperienceEntry {
  company: string;
  role: string;
  location: string;
  period: string;
  highlights: string[];
}

export interface SkillGroup {
  category: string;
  items: string[];
}

export interface EducationEntry {
  institution: string;
  degree: string;
  field: string;
  period: string;
  details: string;
}

export interface Certification {
  name: string;
  issuer: string;
  year: string;
}

export interface ProjectEntry {
  name: string;
  description: string;
  url: string;
  highlights: string[];
}

export interface LanguageEntry {
  language: string;
  proficiency: string;
}

export interface CV {
  summary: string;
  skills: SkillGroup[];
  experience: ExperienceEntry[];
  /** Degrees / schooling. Optional for backward compatibility with older records. */
  education?: EducationEntry[];
  /** Professional certifications and licenses. */
  certifications?: Certification[];
  /** Notable side / open-source / portfolio projects. */
  projects?: ProjectEntry[];
  /** Spoken / written languages with a proficiency label. */
  languages?: LanguageEntry[];
  updatedAt?: string;
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

const pk = (userId: string) => `CV#${userId}`;
const SK = "v1";

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Read the stored CV for a user. Returns null if not yet seeded.
 * Throws with an actionable message if the table does not exist.
 */
export async function getCV(userId: string): Promise<CV | null> {
  try {
    const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: pk(userId), SK } }));
    if (!res.Item) return null;
    const { PK: _pk, SK: _sk, ...cv } = res.Item;
    return cv as CV;
  } catch (err) {
    const name = (err as { name?: string }).name ?? "";
    if (name === "ResourceNotFoundException") {
      throw new Error(
        `DynamoDB table "${TABLE}" (CV) does not exist. Run \`npm run dynamo:init\` to create and seed it.`,
      );
    }
    throw err;
  }
}

/**
 * Write (upsert) the full CV for a user. Overwrites any existing record.
 */
export async function putCV(userId: string, cv: CV): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: pk(userId),
        SK,
        ...cv,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
}

/**
 * Patch individual top-level sections of the CV without rewriting the whole record.
 */
export async function patchCV(
  userId: string,
  fields: Partial<Omit<CV, "updatedAt">>,
): Promise<void> {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (keys.length === 0) return;

  const expr = keys.map((_k, i) => `#f${i} = :v${i}`).join(", ");
  const names = Object.fromEntries(keys.map((k, i) => [`#f${i}`, k]));
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
