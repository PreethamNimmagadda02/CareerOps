/**
 * DynamoDB store for candidate CV data.
 *
 * Table layout (single-table design):
 *   PK = "CV"   SK = "v1"
 *
 * The shape mirrors cv.md, broken into structured sections so individual
 * sections (e.g. a new job) can be patched without rewriting the whole document.
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

export interface EducationEntry {
  institution: string;
  degree: string;
  field: string;
  location: string;
  period: string;
}

export interface SkillGroup {
  category: string;
  items: string[];
}

export interface Certification {
  name: string;
  issuer?: string;
  date?: string;
}

export interface Language {
  name: string;
  proficiency: string;
}

export interface CV {
  summary: string;
  skills: SkillGroup[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  certifications: Certification[];
  languages: Language[];
  updatedAt?: string;
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

const PK = "CV";
const SK = "v1";

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Read the stored CV. Returns null if not yet seeded.
 * Throws with an actionable message if the table does not exist.
 */
export async function getCV(): Promise<CV | null> {
  try {
    const res = await ddb.send(
      new GetCommand({ TableName: TABLE, Key: { PK, SK } }),
    );
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
 * Write (upsert) the full CV. Overwrites any existing record.
 */
export async function putCV(cv: CV): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK,
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
  fields: Partial<Omit<CV, "updatedAt">>,
): Promise<void> {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (keys.length === 0) return;

  const expr = keys.map((_k, i) => `#f${i} = :v${i}`).join(", ");
  const names = Object.fromEntries(keys.map((k, i) => [`#f${i}`, k]));
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
