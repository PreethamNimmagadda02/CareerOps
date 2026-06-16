import type { Company, PortalsConfig } from "../types.js";
import { unquote } from "./text.js";

/**
 * Parse the relevant subset of `portals.yml`. This is a purpose-built parser
 * (not a full YAML implementation) that extracts the `title_filter` keyword
 * lists and the `tracked_companies` entries with their scalar properties.
 */
export function parseConfig(text: string): PortalsConfig {
  const lines = text.split(/\r?\n/);
  let section: "filter" | "queries" | "companies" | null = null;
  let filterKey: "positive" | "negative" | null = null;
  const positive: string[] = [];
  const negative: string[] = [];
  const companies: Company[] = [];
  let current: Company | null = null;

  for (const line of lines) {
    if (/^title_filter:/.test(line)) section = "filter";
    if (/^search_queries:/.test(line)) {
      section = "queries";
      filterKey = null;
    }
    if (/^tracked_companies:/.test(line)) {
      section = "companies";
      filterKey = null;
    }

    if (section === "filter") {
      const key = line.match(/^\s{2}(positive|negative):/);
      if (key) filterKey = key[1] as "positive" | "negative";
      const item = line.match(/^\s{4}-\s+(.+)$/);
      if (item && filterKey === "positive") positive.push(unquote(item[1] as string));
      if (item && filterKey === "negative") negative.push(unquote(item[1] as string));
    }

    if (section === "companies") {
      const name = line.match(/^\s{2}-\s+name:\s+(.+)$/);
      if (name) {
        if (current) companies.push(current);
        current = { name: unquote(name[1] as string) };
        continue;
      }
      if (!current) continue;
      const prop = line.match(/^\s{4}([a-zA-Z_]+):\s+(.+)$/);
      if (prop) current[prop[1] as string] = unquote(prop[2] as string);
    }
  }
  if (current) companies.push(current);
  return { positive, negative, companies };
}
