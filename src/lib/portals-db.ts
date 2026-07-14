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
  enabled: boolean;
}): Company {
  const c: Company = { name: p.name, enabled: p.enabled ? "true" : "false" };
  if (p.careersUrl) c.careers_url = p.careersUrl;
  if (p.api) c.api = p.api;
  return c;
}

/**
 * Load the scan configuration from Postgres.
 * Portals are global (shared by all users); keywords are per-user.
 */
export async function loadConfigFromDb(userId: string): Promise<PortalsConfig> {
  const [portals, keywords] = await Promise.all([
    db.portal.findMany({ orderBy: { id: "asc" } }),
    db.filterKeyword.findMany({ where: { userId }, orderBy: { id: "asc" } }),
  ]);

  return {
    positive: keywords.filter((k) => k.kind === "positive").map((k) => k.value),
    negative: keywords.filter((k) => k.kind === "negative").map((k) => k.value),
    companies: portals.map(rowToCompany),
  };
}

/**
 * Load just the global portal set (no user needed). Used by the shared scan,
 * which scans every portal once for all users rather than per-user.
 */
export async function loadPortals(): Promise<Company[]> {
  const portals = await db.portal.findMany({ orderBy: { id: "asc" } });
  return portals.map(rowToCompany);
}

/** Total number of portals in Postgres (global). */
export async function portalCount(): Promise<number> {
  return db.portal.count();
}
