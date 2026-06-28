import { randomUUID } from "node:crypto";

import type { CV } from "../../../src/lib/cv-store.js";
import type { Profile } from "../../../src/lib/profile-store.js";

/** A unique, namespaced id so E2E runs never collide with real data. */
export function e2eUserId(tag: string): string {
  return `e2e-${tag}-${randomUUID()}`;
}

export function makeCV(over: Partial<CV> = {}): CV {
  return {
    summary: "End-to-end test engineer.",
    skills: [{ category: "Languages", items: ["TypeScript", "Go"] }],
    experience: [
      {
        company: "Acme",
        role: "Senior Engineer",
        location: "Remote",
        period: "2020-2024",
        highlights: ["Shipped X", "Scaled Y"],
      },
    ],
    education: [],
    certifications: [],
    languages: [],
    ...over,
  };
}

export function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    candidate: {
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+1 555 0100",
      location: "London",
      linkedin: "in/ada",
      portfolio_url: "ada.dev",
      github: "ada",
    },
    target_roles: { primary: ["Backend Engineer"], archetypes: [] },
    narrative: {
      headline: "Backend engineer who ships",
      exit_story: "",
      superpowers: [],
      proof_points: [],
    },
    compensation: { target_range: "", currency: "", minimum: "", location_flexibility: "" },
    location: { country: "", city: "", timezone: "", visa_status: "" },
    ...over,
  };
}
