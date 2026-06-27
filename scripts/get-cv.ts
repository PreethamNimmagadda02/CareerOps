/**
 * scripts/get-cv.ts
 *
 * Print the candidate CV from DynamoDB to stdout as Markdown.
 * Used by AI agents (opencode, Copilot) that need the CV text.
 *
 * Usage:
 *   npm run dynamo:cv
 *   npm run dynamo:cv > /tmp/cv.md
 */

import "dotenv/config";
import { getCV } from "../src/lib/cv-store.js";
import { getProfile } from "../src/lib/profile-store.js";
import { cvToMarkdown } from "../src/lib/candidate-loader.js";

const [cvRecord, profileRecord] = await Promise.all([getCV(), getProfile()]);

if (!cvRecord) {
  console.error(
    "[dynamo:cv] ERROR: No CV found in DynamoDB.\n" +
    "Run `npm run dynamo:init` to seed from cv.md.",
  );
  process.exit(1);
}

process.stdout.write(cvToMarkdown(cvRecord, profileRecord?.candidate.full_name));
process.stdout.write("\n");
