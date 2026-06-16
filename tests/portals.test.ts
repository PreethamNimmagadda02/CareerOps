import { describe, expect, it } from "vitest";

import { parseConfig } from "../src/lib/portals.js";

const SAMPLE = `title_filter:
  positive:
    - "AI"
    - "Backend Engineer"
  negative:
    - "Senior"
    - ".NET"

search_queries:
  - "site:greenhouse.io ai engineer india"

tracked_companies:
  - name: Acme
    careers_url: https://jobs.ashbyhq.com/acme
  - name: Globex
    careers_url: https://boards.greenhouse.io/globex
    api: https://boards.greenhouse.io/v1/boards/globex/jobs
  - name: Initech
    careers_url: https://jobs.lever.co/initech
    enabled: false
`;

describe("parseConfig", () => {
  const cfg = parseConfig(SAMPLE);

  it("parses positive and negative filters", () => {
    expect(cfg.positive).toEqual(["AI", "Backend Engineer"]);
    expect(cfg.negative).toEqual(["Senior", ".NET"]);
  });

  it("parses companies with their scalar properties", () => {
    expect(cfg.companies).toHaveLength(3);
    expect(cfg.companies[0]).toMatchObject({
      name: "Acme",
      careers_url: "https://jobs.ashbyhq.com/acme",
    });
    expect(cfg.companies[1]?.api).toBe("https://boards.greenhouse.io/v1/boards/globex/jobs");
    expect(cfg.companies[2]?.enabled).toBe("false");
  });

  it("ignores search_queries entries as companies", () => {
    expect(cfg.companies.map((c) => c.name)).toEqual(["Acme", "Globex", "Initech"]);
  });
});
