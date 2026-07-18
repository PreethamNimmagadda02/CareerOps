-- AlterTable
ALTER TABLE "User" ADD COLUMN "onboardedAt" TIMESTAMP(3);

-- Backfill: any user who already cleared the full activation funnel (a scored
-- role exists) is treated as already onboarded, so this change never bounces an
-- existing, active user back into the guided flow on first load after deploy.
UPDATE "User"
SET "onboardedAt" = now()
WHERE "onboardedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "Application" a
    WHERE a."userId" = "User"."id"
      AND a."score" LIKE '%/5%'
  );
