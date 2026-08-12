-- ONE HUMAN GATE, AND IT IS A CLINICIAN.
--
-- ADMIN_VERIFIED is removed from ReportStatus. It existed to catch transcription
-- errors from a PDF, and results arrive structured through the Randox API now, so
-- there is nothing being transcribed and nothing for the step to catch.
--
--   UPLOADED -> PARSED -> CLINICIAN_REVIEWED -> RELEASED
--
-- Nothing is deleted. Reports sitting at ADMIN_VERIFIED move to PARSED, which is
-- the same position in the new pipeline: the data is in and a clinician has not
-- yet seen it. Their state history is in AuditLogEntry and is untouched, so the
-- fact that they passed the old verification step remains on the record.

-- 1. The holds. With no stage left to park a problem in, "was this parse clean"
--    becomes a property of the report. Empty means clean.
ALTER TABLE "Report" ADD COLUMN "holdReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Report" ADD COLUMN "heldAt" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN "holdsAcknowledgedAt" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN "holdsAcknowledgedById" TEXT;
ALTER TABLE "Report"
  ADD CONSTRAINT "Report_holdsAcknowledgedById_fkey"
  FOREIGN KEY ("holdsAcknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Move the existing rows BEFORE the type is rewritten, or the cast below has
--    a value with nowhere to go.
--
--    They land clean rather than held, and that is the honest reading: a report
--    reached ADMIN_VERIFIED only by a clean automatic parse or by a person
--    entering every row by hand. Marking them held would put a queue of
--    questions in front of a clinician that nobody has any answers to.
UPDATE "Report" SET "status" = 'PARSED' WHERE "status" = 'ADMIN_VERIFIED';

-- 3. Recreate the enum without ADMIN_VERIFIED. Postgres cannot drop a value from
--    one in place.
ALTER TYPE "ReportStatus" RENAME TO "ReportStatus_old";
CREATE TYPE "ReportStatus" AS ENUM ('UPLOADED', 'PARSED', 'CHANGES_REQUESTED', 'CLINICIAN_REVIEWED', 'RELEASED');
ALTER TABLE "Report" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Report"
  ALTER COLUMN "status" TYPE "ReportStatus" USING ("status"::text::"ReportStatus");
ALTER TABLE "Report" ALTER COLUMN "status" SET DEFAULT 'UPLOADED';
DROP TYPE "ReportStatus_old";

-- 4. The exception queue reads "oldest held first", so it gets an index. Partial,
--    because a clean report is the common case and has nothing in the column.
CREATE INDEX "Report_heldAt_idx" ON "Report"("heldAt") WHERE "heldAt" IS NOT NULL;
