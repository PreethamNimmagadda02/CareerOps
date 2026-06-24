import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
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
    region: "us-east-1", // required by SDK, MinIO ignores it
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true, // required for MinIO
  });
}

const BUCKET = process.env.MINIO_BUCKET ?? "careerops";

/** Extract summary from raw markdown text */
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

/** Read a report's lightweight summary by fetching from MinIO. */
export async function readReportSummary(reportRelPath: string): Promise<ReportSummary | null> {
  const filename = reportRelPath.split("/").pop();
  if (!filename) return null;

  try {
    const client = resolveMinioClient();
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: filename }));
    const text = await res.Body?.transformToString("utf-8");
    if (!text) return null;
    return parseReportSummary(text);
  } catch {
    return null;
  }
}

/** Read a full report by its number (e.g. "030") from MinIO. */
export async function readReportByNumber(num: string): Promise<ReportPayload | null> {
  const client = resolveMinioClient();
  const padded = num.padStart(3, "0");

  try {
    // 1. List all objects in the bucket to find the matching filename
    const listRes = await client.send(new ListObjectsV2Command({ Bucket: BUCKET }));
    const keys = (listRes.Contents ?? []).map((obj) => obj.Key ?? "").filter(Boolean);

    // Find the key matching the report number prefix (e.g. "030-company-date.md")
    const filename = keys.find((k) => k.startsWith(`${padded}-`) && k.endsWith(".md"));
    if (!filename) return null;

    // 2. Fetch the file content
    const getRes = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: filename }));
    const markdown = await getRes.Body?.transformToString("utf-8");
    if (!markdown) return null;

    const summary = parseReportSummary(markdown);

    return {
      number: padded,
      path: `reports/${filename}`,
      absolutePath: `MinIO/${filename}`,
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
