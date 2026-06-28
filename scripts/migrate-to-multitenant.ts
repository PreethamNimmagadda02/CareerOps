#!/usr/bin/env node
/**
 * scripts/migrate-to-multitenant.ts
 *
 * One-time migration: move all existing single-user data to the per-user
 * layout required by the multi-tenant architecture.
 *
 * What this does
 * ──────────────
 *
 * 1. DynamoDB — CV
 *    Old key: PK="CV",         SK="v1"
 *    New key: PK="CV#<userId>", SK="v1"
 *    Action:  read old record → write new record (old record is left in place
 *             until --delete-old is passed, so a rollback is always possible).
 *
 * 2. DynamoDB — Profile
 *    Old key: PK="PROFILE",         SK="v1"
 *    New key: PK="PROFILE#<userId>", SK="v1"
 *    Same action as CV.
 *
 * 3. MinIO — Reports
 *    Old key: <filename>              (e.g. "001-acme-2026-06-22.md")
 *    New key: Reports/<userId>/<filename>
 *    Action:  CopyObject to new key → DeleteObject old key.
 *    Uses Application.reportName in Postgres to resolve which filenames belong
 *    to which user. Filenames not linked to any Application are skipped with a
 *    warning (they can be cleaned up manually).
 *
 * 4. Postgres — Application.reportUrl
 *    Old value: <minio>/<bucket>/<filename>
 *    New value: <minio>/<bucket>/Reports/<userId>/<filename>
 *    Action:  recomputes and updates each row.
 *
 * Usage
 * ─────
 *   npm run db:migrate-multitenant:dry    # preview — no writes
 *   npm run db:migrate-multitenant        # apply
 *   npm run db:migrate-multitenant -- --delete-old   # apply + remove old DynamoDB keys
 */

import "dotenv/config";

import "dotenv/config";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { db } from "../src/lib/db.js";
import { ddb, TABLE_CV, TABLE_PROFILE } from "../src/lib/dynamo.js";
import { log } from "../src/lib/logger.js";
import { resolveOwnerUserId } from "../src/lib/owner.js";
import { reportObjectUrl } from "../src/lib/minio.js";

const isDry = process.argv.includes("--dry-run");
const deleteOld = process.argv.includes("--delete-old");

const BUCKET = process.env.MINIO_BUCKET ?? "careerops";

function resolveS3(): S3Client {
  const endpoint = (process.env.MINIO_ENDPOINT ?? "").replace(/\/$/, "");
  const accessKeyId = process.env.MINIO_ACCESS_KEY ?? "";
  const secretAccessKey = process.env.MINIO_SECRET_KEY ?? "";
  if (!endpoint) throw new Error("MINIO_ENDPOINT not set.");
  return new S3Client({
    endpoint,
    region: "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

// ── DynamoDB helpers ──────────────────────────────────────────────────────────

async function migrateDynamoRecord(
  table: string,
  oldPk: string,
  newPk: string,
  label: string,
): Promise<boolean> {
  // Read old record
  const res = await ddb.send(new GetCommand({ TableName: table, Key: { PK: oldPk, SK: "v1" } }));
  if (!res.Item) {
    log.warn(`  ⚠️  ${label}: no record at PK="${oldPk}" — skipping.`);
    return false;
  }

  const { PK: _pk, ...rest } = res.Item;
  log.info(`  ✏️  ${label}: "${oldPk}" → "${newPk}"`);

  if (!isDry) {
    // Write new record with user-scoped PK
    await ddb.send(
      new PutCommand({ TableName: table, Item: { PK: newPk, SK: "v1", ...rest } }),
    );

    if (deleteOld) {
      await ddb.send(
        new DeleteCommand({ TableName: table, Key: { PK: oldPk, SK: "v1" } }),
      );
      log.info(`  🗑  ${label}: deleted old record at PK="${oldPk}"`);
    }
  }

  return true;
}

// ── MinIO helpers ─────────────────────────────────────────────────────────────

/**
 * Scan the bucket and classify every object into canonical vs needs-migration.
 *
 * Canonical (skip):
 *   Reports/<userId>/...            ← correct report path
 *   Resumes/<userId>/resume.<ext>   ← correct resume path
 *
 * Needs migration:
 *   flat         — old flat report keys, e.g. "001-acme.md"
 *   oldReports   — old lowercase "reports/<userId>/..." keys
 *   oldResumes   — old flat-user resume keys "Resumes/<userId>.<ext>"
 *                  (uploaded before the per-user subfolder was introduced)
 */
async function listNonCanonicalObjects(s3: S3Client): Promise<{
  flat: string[];
  oldReports: string[];
  oldResumes: string[];
}> {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET }));
  const all = (res.Contents ?? []).map((o) => o.Key ?? "").filter(Boolean);

  const flat: string[] = [];
  const oldReports: string[] = [];
  const oldResumes: string[] = [];

  for (const k of all) {
    // Already canonical — skip
    if (k.startsWith("Reports/") || k.match(/^Resumes\/[^/]+\/resume\./)) continue;

    if (k.startsWith("reports/")) {
      oldReports.push(k); // lowercase legacy from previous migration run
    } else if (k.startsWith("Resumes/")) {
      // "Resumes/<userId>.<ext>" — old flat-resume path, needs subfolder
      oldResumes.push(k);
    } else {
      flat.push(k); // original flat report key
    }
  }
  return { flat, oldReports, oldResumes };
}

async function copyAndDelete(s3: S3Client, srcKey: string, dstKey: string): Promise<void> {
  await s3.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: encodeURIComponent(`${BUCKET}/${srcKey}`),
      Key: dstKey,
    }),
  );
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: srcKey }));
}

/** Migrate a flat-key report to Reports/<userId>/<filename>. */
async function migrateReport(
  s3: S3Client,
  userId: string,
  filename: string,
): Promise<void> {
  const srcKey = filename;
  const dstKey = `Reports/${userId}/${filename}`;
  log.info(`  ✏️  MinIO: "${srcKey}" → "${dstKey}"`);
  if (!isDry) await copyAndDelete(s3, srcKey, dstKey);
}

/** Re-case an already-migrated lowercase key to Reports/<userId>/<filename>. */
async function recaseReport(s3: S3Client, oldKey: string): Promise<void> {
  // oldKey is like "reports/<userId>/001-acme.md"
  const withoutPrefix = oldKey.slice("reports/".length); // "<userId>/001-acme.md"
  const dstKey = `Reports/${withoutPrefix}`;
  log.info(`  ✏️  MinIO recase: "${oldKey}" → "${dstKey}"`);
  if (!isDry) await copyAndDelete(s3, oldKey, dstKey);
}

/**
 * Re-path an old flat-resume key to the per-user subfolder form.
 * "Resumes/<userId>.<ext>" → "Resumes/<userId>/resume.<ext>"
 */
async function migrateResume(s3: S3Client, oldKey: string): Promise<void> {
  // oldKey is like "Resumes/abc123.pdf"
  const basename = oldKey.slice("Resumes/".length); // "abc123.pdf"
  const dot = basename.lastIndexOf(".");
  if (dot === -1) {
    log.warn(`  ⚠️  Cannot parse resume key "${oldKey}" — skipping.`);
    return;
  }
  const userId = basename.slice(0, dot);
  const ext = basename.slice(dot + 1);
  const dstKey = `Resumes/${userId}/resume.${ext}`;
  log.info(`  ✏️  MinIO resume: "${oldKey}" → "${dstKey}"`);
  if (!isDry) await copyAndDelete(s3, oldKey, dstKey);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info(`🔄 Multi-tenant migration${isDry ? " [DRY RUN]" : ""}${deleteOld ? " [--delete-old]" : ""}`);
  log.info("");

  const userId = await resolveOwnerUserId();
  log.info(`👤 Owner userId: ${userId}`);
  log.info("");

  // ── 1 & 2. DynamoDB ────────────────────────────────────────────────────────
  log.info("── DynamoDB ──────────────────────────────────────────────────────");

  const [cvMigrated, profileMigrated] = await Promise.all([
    migrateDynamoRecord(TABLE_CV, "CV", `CV#${userId}`, "CV"),
    migrateDynamoRecord(TABLE_PROFILE, "PROFILE", `PROFILE#${userId}`, "Profile"),
  ]);

  log.info("");

  // ── 3. MinIO reports ───────────────────────────────────────────────────────
  log.info("── MinIO reports ─────────────────────────────────────────────────");

  let s3: S3Client;
  try {
    s3 = resolveS3();
  } catch (err) {
    log.warn(`  ⚠️  MinIO not configured (${(err as Error).message}) — skipping.`);
    s3 = null as unknown as S3Client;
  }

  let reportsMigrated = 0;
  let reportsSkipped = 0;

  if (s3) {
    // Build a map of filename → userId from Postgres Application rows
    const allApps = await db.application.findMany({
      select: { userId: true, reportName: true, reportUrl: true, id: true },
    });

    const filenameToUserId = new Map<string, string>();
    for (const app of allApps) {
      if (app.reportName) {
        // Handles both "001-acme.md" and legacy "[001](reports/001-acme.md)" forms
        const match = app.reportName.match(/(\d{3}-.+\.md)$/);
        if (match) filenameToUserId.set(match[1], app.userId);
      }
    }

    const { flat: flatKeys, oldReports, oldResumes } = await listNonCanonicalObjects(s3);
    log.info(
      `  Found ${flatKeys.length} flat-key, ${oldReports.length} lowercase-prefixed report(s),` +
      ` and ${oldResumes.length} flat-resume(s) to migrate.`,
    );

    // Phase A: flat keys → Reports/<userId>/<filename>
    for (const filename of flatKeys) {
      const owner = filenameToUserId.get(filename);
      if (!owner) {
        log.warn(`  ⚠️  "${filename}" has no matching Application row — using owner userId.`);
        await migrateReport(s3, userId, filename);
      } else {
        await migrateReport(s3, owner, filename);
      }
      reportsMigrated++;
    }

    // Phase B: old lowercase "reports/<userId>/..." → "Reports/<userId>/..."
    for (const oldKey of oldReports) {
      await recaseReport(s3, oldKey);
      reportsMigrated++;
    }

    // Phase C: "Resumes/<userId>.<ext>" → "Resumes/<userId>/resume.<ext>"
    if (oldResumes.length > 0) {
      log.info("");
      log.info("── MinIO resumes ─────────────────────────────────────────────────");
      for (const oldKey of oldResumes) {
        await migrateResume(s3, oldKey);
      }
    }

    // ── 4. Update Application.reportUrl in Postgres ─────────────────────────
    log.info("");
    log.info("── Postgres Application.reportUrl ────────────────────────────────");

    let urlsUpdated = 0;
    for (const app of allApps) {
      if (!app.reportName) continue;
      const match = app.reportName.match(/(\d{3}-.+\.md)$/);
      if (!match) continue;
      const filename = match[1];
      const newUrl = reportObjectUrl(app.userId, filename);
      if (app.reportUrl === newUrl) { reportsSkipped++; continue; }

      log.info(`  ✏️  App ${app.id.slice(0, 8)}: "${app.reportUrl ?? "(null)"}" → "${newUrl}"`);
      if (!isDry) {
        await db.application.update({
          where: { id: app.id },
          data: { reportUrl: newUrl, updatedAt: new Date() },
        });
      }
      urlsUpdated++;
    }
    log.info(`  ${urlsUpdated} reportUrl(s) updated, ${reportsSkipped} already current.`);
  }

  log.info("");
  log.info(
    `🏁 ${isDry ? "[dry-run] " : ""}` +
    `DynamoDB: CV=${cvMigrated ? "✓" : "–"}  Profile=${profileMigrated ? "✓" : "–"}  ` +
    `Reports: ${reportsMigrated} migrated.`,
  );

  if (!isDry && !deleteOld) {
    log.info("");
    log.info(
      "ℹ️  Old DynamoDB records (PK=\"CV\", PK=\"PROFILE\") were kept as a rollback safety net.\n" +
      "   Re-run with --delete-old to remove them once you've verified the migration.",
    );
  }
}

main().catch((err: unknown) => {
  log.error(`❌ Fatal: ${(err as Error).message}`);
  process.exit(1);
});
