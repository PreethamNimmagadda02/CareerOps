import { getProfile } from "../../src/lib/profile-store";
import { getCV } from "../../src/lib/cv-store";
import {
  validateCandidateReadiness,
  validateMatchingReadiness,
} from "../../src/lib/profile-validation";
import type { PipelineCommand } from "./pipeline";

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

/**
 * Pre-flight gate for the pipeline. Returns an error message when the command
 * must NOT run, or `null` when it's allowed.
 *
 *  • scan      → requires the profile's Job Matching preferences to be filled
 *                in (they drive the matchers).
 *  • evaluate  → requires the profile/CV to have the minimum required details.
 */
export async function preflightPipeline(
  command: PipelineCommand,
  userId: string,
): Promise<string | null> {
  if (command === "scan" || command === "scan:fallback") {
    const profile = await safe(() => getProfile(userId));
    const matching = validateMatchingReadiness(profile);
    if (!matching.ok) {
      return (
        "Scan skipped — your job matching preferences are missing:\n" +
        matching.missing.map((m) => `  • ${m}`).join("\n") +
        '\nFill in the "Job Matching" section on your profile page, then try again.'
      );
    }
    return null;
  }

  // evaluate / evaluate:all / evaluate:dry
  const [profile, cv] = await Promise.all([
    safe(() => getProfile(userId)),
    safe(() => getCV(userId)),
  ]);
  const readiness = validateCandidateReadiness(profile, cv);
  if (!readiness.ok) {
    return (
      "Evaluate skipped — your profile is missing required details:\n" +
      readiness.missing.map((m) => `  • ${m}`).join("\n") +
      "\nComplete your profile, then try again."
    );
  }
  return null;
}
