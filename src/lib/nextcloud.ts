/**
 * Nextcloud WebDAV integration.
 *
 * Uploads report markdown files directly to Nextcloud's WebDAV endpoint.
 * Reads connection details from environment variables:
 *   NEXTCLOUD_URL      — e.g. http://nextcloud:80  (no trailing slash)
 *   NEXTCLOUD_USER     — Nextcloud admin username
 *   NEXTCLOUD_PASSWORD — Nextcloud admin password
 *
 * The upload target is:
 *   {NEXTCLOUD_URL}/remote.php/dav/files/{NEXTCLOUD_USER}/CareerOps-Reports/{filename}
 */

const NC_DIR = "CareerOps-Reports";

function resolveConfig(): { url: string; user: string; pass: string } {
  const url = (process.env.NEXTCLOUD_URL ?? "").replace(/\/$/, "");
  const user = process.env.NEXTCLOUD_USER ?? "";
  const pass = process.env.NEXTCLOUD_PASSWORD ?? "";
  if (!url || !user || !pass) {
    throw new Error(
      "Nextcloud not configured. Set NEXTCLOUD_URL, NEXTCLOUD_USER, and NEXTCLOUD_PASSWORD in .env",
    );
  }
  return { url, user, pass };
}

function authHeader(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

/** Create the `CareerOps-Reports` WebDAV collection if it does not exist yet. */
async function ensureFolder(url: string, user: string, pass: string): Promise<void> {
  const folderUrl = `${url}/remote.php/dav/files/${encodeURIComponent(user)}/${NC_DIR}`;
  const res = await fetch(folderUrl, {
    method: "MKCOL",
    headers: { Authorization: authHeader(user, pass) },
  });
  // 201 = created, 405 = already exists — both are acceptable
  if (res.status !== 201 && res.status !== 405) {
    throw new Error(`Failed to create Nextcloud folder "${NC_DIR}": HTTP ${res.status}`);
  }
}

/**
 * Upload a report markdown file to Nextcloud via WebDAV.
 *
 * @param filename — e.g. "001-acme-2026-06-22.md"
 * @param content  — full markdown text of the report
 * @returns the public WebDAV URL of the uploaded file
 */
export async function uploadReport(filename: string, content: string): Promise<string> {
  const { url, user, pass } = resolveConfig();
  await ensureFolder(url, user, pass);

  const fileUrl = `${url}/remote.php/dav/files/${encodeURIComponent(user)}/${NC_DIR}/${encodeURIComponent(filename)}`;

  const res = await fetch(fileUrl, {
    method: "PUT",
    headers: {
      Authorization: authHeader(user, pass),
      "Content-Type": "text/markdown; charset=utf-8",
    },
    body: content,
  });

  if (!res.ok) {
    throw new Error(
      `Nextcloud upload failed for "${filename}": HTTP ${res.status} ${res.statusText}`,
    );
  }

  return fileUrl;
}
