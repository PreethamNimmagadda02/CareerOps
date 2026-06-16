/** Strip surrounding single/double quotes and trim whitespace. */
export function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

/**
 * Match a keyword against a lowercased string. Two-letter keywords like
 * "ai"/"ml" require word boundaries to avoid false positives (e.g. "email").
 */
export function keywordMatch(lower: string, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  if (kw === "ai" || kw === "ml") {
    return new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`).test(lower);
  }
  return lower.includes(kw);
}

/** Normalize a URL for dedup comparison: drop query, trailing slash, lowercase. */
export function normalizeUrl(url: string | undefined): string {
  return String(url || "")
    .replace(/\?.*$/, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

/** Build a fuzzy dedup key from company + title. */
export function dedupKey(company: string, title: string): string {
  return `${company} ${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Build a strict company||title key for URL indexing. */
export function normalizeKey(company: string, title: string): string {
  return `${company}||${title}`.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Convert a string to a filesystem/URL-safe slug. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Today's date as an ISO `YYYY-MM-DD` string. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
