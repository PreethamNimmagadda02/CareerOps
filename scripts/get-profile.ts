/**
 * scripts/get-profile.ts
 *
 * Print the candidate profile from DynamoDB to stdout as YAML.
 * Used by AI agents (opencode, Copilot) that need the profile data.
 *
 * Usage:
 *   npm run dynamo:profile
 *   npm run dynamo:profile > /tmp/profile.yml
 */

import "dotenv/config";
import { getProfile } from "../src/lib/profile-store.js";
import { profileToYaml } from "../src/lib/candidate-loader.js";

const profileRecord = await getProfile();

if (!profileRecord) {
  console.error(
    "[dynamo:profile] ERROR: No profile found in DynamoDB.\n" +
    "Run `npm run dynamo:init` to seed from config/profile.yml.",
  );
  process.exit(1);
}

process.stdout.write(profileToYaml(profileRecord));
process.stdout.write("\n");
