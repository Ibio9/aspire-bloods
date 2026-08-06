-- CreateEnum
CREATE TYPE "IngestionOutcome" AS ENUM ('INGESTED', 'PARTIAL', 'DUPLICATE', 'UNMATCHED_PATIENT', 'FAILED');

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_panelId_fkey";

-- AlterTable: a panel is just the test-package label — it titles the report
-- and groups markers but does no clinical work, so a report can now exist
-- with no matching panel at all.
ALTER TABLE "Report" ALTER COLUMN "panelId" DROP NOT NULL;

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_uploadedById_fkey";

-- AlterTable: automated ingestion (Randox API) has no staff uploader.
ALTER TABLE "Report" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Randox's own id for a result set, set only on API-ingested
-- reports — lets a redelivered payload update the same report instead of
-- duplicating it.
ALTER TABLE "Report" ADD COLUMN "externalId" TEXT;
CREATE UNIQUE INDEX "Report_externalId_key" ON "Report"("externalId");

-- AlterTable: what the practice paid Randox has no place in a patient
-- portal.
ALTER TABLE "Panel" DROP COLUMN "b2bPriceGBP";

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "Panel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "IngestionLogEntry" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "externalId" TEXT,
    "outcome" "IngestionOutcome" NOT NULL,
    "reportId" TEXT,
    "markerCount" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL,
    "mappingFailures" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestionLogEntry_sourceKey_idx" ON "IngestionLogEntry"("sourceKey");
CREATE INDEX "IngestionLogEntry_externalId_idx" ON "IngestionLogEntry"("externalId");
CREATE INDEX "IngestionLogEntry_createdAt_idx" ON "IngestionLogEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "IngestionLogEntry" ADD CONSTRAINT "IngestionLogEntry_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
