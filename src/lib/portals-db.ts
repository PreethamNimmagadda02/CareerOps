/**
 * Postgres-backed portal configuration.
 *
 * Postgres (`Portal` + `FilterKeyword` tables) is the single source of truth
 * for scan targets and title-filter keywords. Use `npm run portals` (the
 * `career-ops-portals` CLI) to add, update, delete, enable, or disable portals.
 */
import type { Company, PortalsConfig } from "../types.js";
import { db } from "./db.js";

/** Map a Portal DB row to the in-memory `Company` shape the scanner expects. */
function rowToCompany(p: {
  name: string;
  careersUrl: string | null;
  api: string | null;
  scanQuery: string | null;
  notes: string | null;
  enabled: boolean;
}): Company {
  const c: Company = { name: p.name, enabled: p.enabled ? "true" : "false" };
  if (p.careersUrl) c.careers_url = p.careersUrl;
  if (p.api) c.api = p.api;
  if (p.scanQuery) c.scan_query = p.scanQuery;
  if (p.notes) c.notes = p.notes;
  return c;
}

/** Load the scan configuration (companies + title-filter keywords) from Postgres. */
export async function loadConfigFromDb(): Promise<PortalsConfig> {
  const [portals, keywords] = await Promise.all([
    db.portal.findMany({ orderBy: { id: "asc" } }),
    db.filterKeyword.findMany({ orderBy: { id: "asc" } }),
  ]);

  return {
    positive: keywords.filter((k) => k.kind === "positive").map((k) => k.value),
    negative: keywords.filter((k) => k.kind === "negative").map((k) => k.value),
    companies: portals.map(rowToCompany),
  };
}

/** Number of portals currently stored in Postgres. */
export async function portalCount(): Promise<number> {
  return db.portal.count();
}
