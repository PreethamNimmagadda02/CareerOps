-- AlterTable
ALTER TABLE "User" ADD COLUMN     "reportSeq" INTEGER NOT NULL DEFAULT 0;

-- Backfill each user's report counter to their current maximum report number,
-- parsed from the leading digits of Application.reportName (current filename
-- form "001-acme-….md" or legacy markdown-link form "[001](…)"). This ensures
-- newly-allocated numbers never collide with a user's existing report files.
UPDATE "User" u
SET "reportSeq" = sub.maxnum
FROM (
  SELECT "userId",
         MAX(CAST((regexp_match("reportName", '^\[?(\d+)'))[1] AS INTEGER)) AS maxnum
  FROM "Application"
  WHERE "reportName" ~ '^\[?\d+'
  GROUP BY "userId"
) sub
WHERE u.id = sub."userId";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

