/**
 * Postgres-backed portal configuration.
 *
 * Postgres (the `Portal` table) is the single source of truth for scan
 * targets. Use `npm run portals` (the `career-ops-portals` CLI) to add,
 * update, delete, enable, or disable portals.
 */
import type { Company } from "../types.js";
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
