#!/usr/bin/env node
/**
 * scripts/migrate-bucket.ts
 *
 * Consolidates all MinIO data into a single "careerops" bucket with the
 * canonical path layout:
 *
 *   careerops/
 *   ├── Reports/<userId>/<filename>.md   ← evaluation reports
 *   └── Resumes/<userId>/resume.<ext>    ← uploaded resumes
 *
 * What it does
 * ────────────
 * 1. Lists every object in every bucket except "careerops".
 * 2. Classifies each object as a report or a resume (by extension + path).
 * 3. Derives the canonical "careerops" key for it.
 * 4. Copies it → careerops/<canonical-key>.
 * 5. Updates Postgres:
 *      • User.resumeKey   → new canonical resume key
 *      • Application.reportUrl → recomputed URL pointing at "careerops"
 * 6. Deletes every source object, then the source buckets.
 *
 * Usage
 * ─────
 *   npm run db:migrate-bucket:dry   # preview — no writes / deletes
 *   npm run db:migrate-bucket       # apply
 */

import "dotenv/config";

import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  GetBucketLocationCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

import { db } from "../src/lib/db.js";
import { log } from "../src/lib/logger.js";
import { reportObjectKey, reportObjectUrl } from "../src/lib/minio.js";

const TARGET_BUCKET = process.env.MINIO_BUCKET ?? "careerops";
const isDry = process.argv.includes("--dry-run");

// ── S3 client ─────────────────────────────────────────────────────────────────

function resolveS3(): S3Client {
  const endpoint = (process.env.MINIO_ENDPOINT ?? "").replace(/\/$/, "");
  const accessKeyId = process.env.MINIO_ACCESS_KEY ?? "";
  const secretAccessKey = process.env.MINIO_SECRET_KEY ?? "";
  if (!endpoint) throw new Error("MINIO_ENDPOINT is not set.");
  return new S3Client({
    endpoint,
    region: "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

// ── Path classification ───────────────────────────────────────────────────────

const RESUME_EXTS = new Set(["pdf", "doc", "docx"]);

function extOf(key: string): string {
  return key.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * Decide whether an object is a resume or a report based on its key.
 *
 * Heuristics (in order):
 *  • Key contains "/resumes/" or "/resume." → resume
 *  • Extension is pdf/doc/docx             → resume
 *  • Extension is md                       → report
 *  • Otherwise                             → unknown (skipped with warning)
 */
function classify(key: string): "resume" | "report" | "unknown" {
  const lower = key.toLowerCase();
  if (lower.includes("/resumes/") || lower.includes("/resume.")) return "resume";
  const ext = extOf(key);
  if (RESUME_EXTS.has(ext)) return "resume";
  if (ext === "md") return "report";
  return "unknown";
}

/**
 * Extract the userId from any of our historical key formats:
 *
 *   Reports/<userId>/<filename>             ← current report key
 *   Reports/<userId>/resumes/<userId>.pdf   ← misplaced resume (legacy bug)
 *   Resumes/<userId>/resume.<ext>           ← current resume key
 *   Resumes/<userId>.<ext>                  ← old flat resume key
 *   resumes/<userId>.<ext>                  ← original flat resume key (lowercase)
 *   reports/<userId>/<filename>             ← old lowercase report key
 *   <filename>                              ← original flat report key (no userId)
 *
 * Returns null for flat keys with no userId segment.
 */
function extractUserId(key: string): string | null {
  // Keys with a known prefix that include userId as first path segment
  const prefixes = ["Reports/", "Resumes/", "reports/", "resumes/"];
  for (const p of prefixes) {
    if (key.startsWith(p)) {
      const rest = key.slice(p.length);
      const slash = rest.indexOf("/");
      if (slash !== -1) return rest.slice(0, slash); // "Reports/<userId>/..." → <userId>
      // "Resumes/<userId>.<ext>" — userId is everything before the last dot
      const dot = rest.lastIndexOf(".");
      if (dot !== -1) return rest.slice(0, dot);
      return rest;
    }
  }
  return null; // flat key like "001-acme.md"
}

/**
 * Extract just the filename from any key (last path segment).
 * For a resume we always normalise to "resume.<ext>".
 */
function canonicalKey(
  kind: "report" | "resume",
  srcKey: string,
  userId: string,
): string {
  if (kind === "resume") {
    const ext = extOf(srcKey) || "pdf";
    return `Resumes/${userId}/resume.${ext}`;
  }
  // Report — keep original filename
  const filename = srcKey.split("/").pop()!;
  return reportObjectKey(userId, filename); // "Reports/<userId>/<filename>"
}

// ── Bucket helpers ────────────────────────────────────────────────────────────

async function ensureBucket(s3: S3Client, bucket: string): Promise<void> {
  try {
    await s3.send(new GetBucketLocationCommand({ Bucket: bucket }));
  } catch {
    if (!isDry) {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      log.info(`  ✅ Created bucket "${bucket}"`);
    }
  }
}

async function listAll(s3: S3Client, bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function copyObject(
  s3: S3Client,
  srcBucket: string,
  srcKey: string,
  dstKey: string,
): Promise<void> {
  await s3.send(
    new CopyObjectCommand({
      Bucket: TARGET_BUCKET,
      CopySource: encodeURIComponent(`${srcBucket}/${srcKey}`),
      Key: dstKey,
    }),
  );
}

async function deleteObject(s3: S3Client, bucket: string, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

async function deleteBucket(s3: S3Client, bucket: string): Promise<void> {
  await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info(`🪣  Bucket migration${isDry ? " [DRY RUN]" : ""}`);
  log.info(`   target bucket : ${TARGET_BUCKET}`);
  log.info("");

  const s3 = resolveS3();

  // Resolve owner userId for any flat-key reports with no userId in the path
  const ownerUserId = process.env.CAREER_OPS_USER_ID?.trim() ?? "";
  if (!ownerUserId) {
    log.warn(
      "  ⚠️  CAREER_OPS_USER_ID not set — flat-key reports will be skipped.\n" +
      "     Set it in .env or pass it as an environment variable.",
    );
  }

  // Ensure target bucket exists
  await ensureBucket(s3, TARGET_BUCKET);

  // List all buckets
  const { Buckets = [] } = await s3.send(new ListBucketsCommand({}));
  const sourceBuckets = Buckets.map((b) => b.Name!).filter(
    (n) => n && n !== TARGET_BUCKET,
  );

  log.info(`📦 Source buckets: ${sourceBuckets.join(", ") || "(none)"}`);
  log.info("");

  // Build a map of all Postgres Application rows for URL updates
  const allApps = await db.application.findMany({
    select: { id: true, userId: true, reportName: true, reportUrl: true },
  });

  // Build a map of userId → User row for resume key updates
  const allUsers = await db.user.findMany({
    select: { id: true, resumeKey: true },
  });

  let copied = 0;
  let skipped = 0;
  let resumeKeyUpdates = 0;
  let reportUrlUpdates = 0;

  for (const srcBucket of sourceBuckets) {
    const keys = await listAll(s3, srcBucket);
    log.info(`── ${srcBucket} (${keys.length} object(s)) ${"─".repeat(40)}`);

    if (keys.length === 0) {
      log.info("   (empty)");
    }

    for (const srcKey of keys) {
      const kind = classify(srcKey);

      if (kind === "unknown") {
        log.warn(`  ⚠️  "${srcKey}" — cannot classify, skipping.`);
        skipped++;
        continue;
      }

      // Determine userId
      let userId = extractUserId(srcKey);
      if (!userId) {
        if (!ownerUserId) {
          log.warn(`  ⚠️  "${srcKey}" — no userId in path and CAREER_OPS_USER_ID not set, skipping.`);
          skipped++;
          continue;
        }
        userId = ownerUserId;
      }

      const dstKey = canonicalKey(kind, srcKey, userId);
      log.info(`  ${kind === "resume" ? "📄" : "📝"} "${srcKey}"`);
      log.info(`       → ${TARGET_BUCKET}/${dstKey}`);

      if (!isDry) {
        await copyObject(s3, srcBucket, srcKey, dstKey);
        await deleteObject(s3, srcBucket, srcKey);
      }
      copied++;

      // ── Postgres: update User.resumeKey ──────────────────────────────────
      if (kind === "resume") {
        const user = allUsers.find((u) => u.id === userId);
        if (user && user.resumeKey !== dstKey) {
          log.info(`       DB User.resumeKey: "${user.resumeKey}" → "${dstKey}"`);
          if (!isDry) {
            await db.user.update({
              where: { id: userId },
              data: { resumeKey: dstKey, updatedAt: new Date() },
            });
          }
          resumeKeyUpdates++;
        }
      }

      // ── Postgres: update Application.reportUrl ────────────────────────────
      if (kind === "report") {
        const filename = srcKey.split("/").pop()!;
        const newUrl = reportObjectUrl(userId, filename);
        const affected = allApps.filter(
          (a) =>
            a.userId === userId &&
            a.reportName &&
            a.reportName.endsWith(filename) &&
            a.reportUrl !== newUrl,
        );
        for (const app of affected) {
          log.info(
            `       DB Application.reportUrl: "${app.reportUrl ?? "(null)"}" → "${newUrl}"`,
          );
          if (!isDry) {
            await db.application.update({
              where: { id: app.id },
              data: { reportUrl: newUrl, updatedAt: new Date() },
            });
          }
          reportUrlUpdates++;
        }
      }
    }

    log.info("");

    // Delete the now-empty source bucket
    if (!isDry && keys.length > 0) {
      await deleteBucket(s3, srcBucket);
      log.info(`  🗑  Deleted bucket "${srcBucket}"`);
    } else if (!isDry && keys.length === 0) {
      await deleteBucket(s3, srcBucket);
      log.info(`  🗑  Deleted empty bucket "${srcBucket}"`);
    } else {
      log.info(`  [dry-run] Would delete bucket "${srcBucket}"`);
    }
    log.info("");
  }

  log.info(
    `🏁 ${isDry ? "[dry-run] " : ""}` +
    `${copied} object(s) migrated, ${skipped} skipped  |  ` +
    `DB: ${resumeKeyUpdates} resumeKey(s) + ${reportUrlUpdates} reportUrl(s) updated.`,
  );
}

main().catch((err: unknown) => {
  log.error(`❌ Fatal: ${(err as Error).message}`);
  process.exit(1);
});
