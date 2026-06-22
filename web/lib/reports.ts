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

function resolveNextcloud() {
  const url = (process.env.NEXTCLOUD_URL || "http://localhost:8090").replace(/\/$/, "");
  const user = process.env.NEXTCLOUD_USER || "admin";
  const pass = process.env.NEXTCLOUD_PASSWORD || "careerops123";
  const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  return { url, user, auth };
}

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

/** Read a report's lightweight summary by fetching from Nextcloud. */
export async function readReportSummary(reportRelPath: string): Promise<ReportSummary | null> {
  const { url, user, auth } = resolveNextcloud();
  const filename = reportRelPath.split("/").pop();
  if (!filename) return null;

  try {
    const fileUrl = `${url}/remote.php/dav/files/${encodeURIComponent(user)}/CareerOps-Reports/${encodeURIComponent(filename)}`;
    const res = await fetch(fileUrl, { headers: { Authorization: auth } });
    if (!res.ok) return null;
    const text = await res.text();
    return parseReportSummary(text);
  } catch {
    return null;
  }
}

/** Read a full report by its number (e.g. "030") from Nextcloud. */
export async function readReportByNumber(num: string): Promise<ReportPayload | null> {
  const { url, user, auth } = resolveNextcloud();
  const padded = num.padStart(3, "0");
  const folderUrl = `${url}/remote.php/dav/files/${encodeURIComponent(user)}/CareerOps-Reports/`;

  try {
    // 1. List directory to find the filename
    const listRes = await fetch(folderUrl, {
      method: "PROPFIND",
      headers: { "Depth": "1", Authorization: auth }
    });
    if (!listRes.ok) return null;
    const xml = await listRes.text();
    
    // Find filename matching the number (e.g. 030-company-date.md)
    const match = xml.match(new RegExp(`>([^<]*${padded}-[^<]*\\.md)<`));
    if (!match) return null;
    
    // match[1] is the absolute path, e.g. /remote.php/dav/files/admin/CareerOps-Reports/030-unstructured-2026-06-22.md
    const filePath = match[1];
    const fileUrl = `${url}${filePath}`;
    
    // 2. Fetch the file content
    const fileRes = await fetch(fileUrl, { headers: { Authorization: auth } });
    if (!fileRes.ok) return null;
    const markdown = await fileRes.text();
    
    const summary = parseReportSummary(markdown);
    
    const filename = filePath.split("/").pop() || "";

    return {
      number: padded,
      path: `reports/${filename}`,
      absolutePath: `Nextcloud/${filename}`,
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
