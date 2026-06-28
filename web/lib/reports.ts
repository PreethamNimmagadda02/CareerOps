import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import type { ReportPayload } from "./types";

const reUrl = /^\*\*URL:\*\*\s*(https?:\/\/\S+)/m;
const reProvider = /^\*\*Provider:\*\*\s*(.+)$/m;
const reDate = /^\*\*Date:\*\*\s*(.+)$/m;
const reTitle = /^#\s*Evaluation:\s*(.+?)\s+[—-]\s+(.+)$/m;

// Table-cell extraction: | **Field** | value |
function tableField(text: string, field: string): string | undefined {
  const re = new RegExp(`\\|\\s*\\*\\*${field}\\*\\*\\s*\\|\\s*(.+?)\\s*\\|`, "i");
  const m = text.match(re);
  return m ? m[1].trim() : undefined;
}

export interface ReportSummary {
  url: string | null;
  provider: string | null;
  date: string | null;
  company: string | null;
  role: string | null;
  archetype?: string;
  tldr?: string;
  remote?: string;
  comp?: string;
}

function resolveMinioClient(): S3Client {
  const endpoint = (process.env.MINIO_ENDPOINT || "http://localhost:9000").replace(/\/$/, "");
  const accessKeyId = process.env.MINIO_ACCESS_KEY || "admin";
  const secretAccessKey = process.env.MINIO_SECRET_KEY || "careerops123";

  return new S3Client({
    endpoint,
    region: "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

const BUCKET = process.env.MINIO_BUCKET ?? "careerops";

/** Derive the MinIO object key for a user's report. */
function reportKey(userId: string, filename: string): string {
  return `Reports/${userId}/${filename}`;
}

/** Extract just the filename from a stored reportName value (strips any path prefix). */
function toFilename(reportRelPath: string): string {
  return reportRelPath.split("/").pop() ?? reportRelPath;
}

/** Extract summary from raw markdown text. */
export function parseReportSummary(text: string): ReportSummary {
  const head = text.slice(0, 4000);
  const title = head.match(reTitle);
  let comp = tableField(head, "Comp");
  if (!comp) comp = tableField(head, "Compensation");

  return {
    url: head.match(reUrl)?.[1] ?? null,
    provider: head.match(reProvider)?.[1]?.trim() ?? null,
    date: head.match(reDate)?.[1]?.trim() ?? null,
    company: title?.[1]?.trim() ?? null,
    role: title?.[2]?.trim() ?? null,
    archetype: tableField(head, "Archetype"),
    tldr: tableField(head, "TL;DR"),
    remote: tableField(head, "Remote"),
    comp,
  };
}

/**
 * Read a report's lightweight summary from MinIO.
 *
 * @param userId        — the report owner's user id
 * @param reportRelPath — filename stored in Application.reportName (e.g. "005-acme.md")
 */
export async function readReportSummary(
  userId: string,
  reportRelPath: string,
): Promise<ReportSummary | null> {
  const filename = toFilename(reportRelPath);
  if (!filename) return null;

  try {
    const client = resolveMinioClient();
    const key = reportKey(userId, filename);
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const text = await res.Body?.transformToString("utf-8");
    if (!text) return null;
    return parseReportSummary(text);
  } catch {
    return null;
  }
}

/**
 * Read a full report by its number from MinIO, scoped to a specific user.
 *
 * @param userId — the report owner's user id
 * @param num    — zero-padded or plain report number, e.g. "030" or "30"
 */
export async function readReportByNumber(
  userId: string,
  num: string,
): Promise<ReportPayload | null> {
  const client = resolveMinioClient();
  const padded = num.padStart(3, "0");
    const prefix = `Reports/${userId}/`;

  try {
    const listRes = await client.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }),
    );
    const keys = (listRes.Contents ?? []).map((obj) => obj.Key ?? "").filter(Boolean);

    // Find the key matching the report-number prefix within this user's folder.
    const key = keys.find((k) => {
      const name = k.slice(prefix.length); // strip user prefix → just the filename
      return name.startsWith(`${padded}-`) && name.endsWith(".md");
    });
    if (!key) return null;

    const filename = key.slice(prefix.length);

    const getRes = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const markdown = await getRes.Body?.transformToString("utf-8");
    if (!markdown) return null;

    const summary = parseReportSummary(markdown);

    return {
      number: padded,
      path: key,
      absolutePath: `MinIO/${key}`,
      company: summary.company ?? "",
      role: summary.role ?? "",
      markdown,
      url: summary.url,
      provider: summary.provider,
      date: summary.date,
    };
  } catch {
    return null;
  }
}
