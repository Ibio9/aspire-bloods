-- Phase 2: multi-source result ingestion.
-- Hand-edited from the Prisma-generated draft to backfill existing Report
-- rows safely — sourceId is a required FK, so the naive ADD COLUMN...NOT
-- NULL would fail (and if forced, would not have a correct value) on a
-- non-empty table. Order here matters: create + seed Source, add the
-- column nullable, backfill every existing report to randox_pdf (the only
-- source that existed before this migration), then lock it to NOT NULL.

-- AlterTable
ALTER TABLE "Marker" ADD COLUMN     "crossSourceComparable" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_key_key" ON "Source"("key");

-- Seed the three sources named in the brief. gen_random_uuid() requires
-- pgcrypto, which is not guaranteed enabled — use a deterministic
-- literal UUID per source instead so this migration has no extension
-- dependency.
INSERT INTO "Source" ("id", "key", "name", "isActive", "createdAt") VALUES
    ('00000000-0000-0000-0000-000000000001', 'randox_pdf', 'Randox Health', true, CURRENT_TIMESTAMP),
    ('00000000-0000-0000-0000-000000000002', 'aspire_inhouse', 'Aspire Clinic (in-house)', true, CURRENT_TIMESTAMP),
    ('00000000-0000-0000-0000-000000000003', 'manual_entry', 'Manual entry', true, CURRENT_TIMESTAMP);

-- AlterTable: add nullable first so existing rows aren't rejected
ALTER TABLE "Report" ADD COLUMN     "sourceId" TEXT;

-- Backfill: every report that existed before this migration came in via
-- the Randox PDF upload flow — there was no other route yet.
UPDATE "Report" SET "sourceId" = '00000000-0000-0000-0000-000000000001' WHERE "sourceId" IS NULL;

-- Now safe to enforce NOT NULL
ALTER TABLE "Report" ALTER COLUMN "sourceId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Report_sourceId_idx" ON "Report"("sourceId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
