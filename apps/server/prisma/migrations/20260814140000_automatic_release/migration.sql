-- RESULTS RELEASE AUTOMATICALLY. THE CLINICIAN GATE IS REMOVED.
--
-- CLINICIAN_REVIEWED is removed from ReportStatus, the same way ADMIN_VERIFIED
-- was removed before it. The practice's decision: a patient not seeing their own
-- abnormal result is worse than them seeing it, and a result sitting in a queue
-- nobody opens is the real risk.
--
--   UPLOADED -> PARSED -> RELEASED
--
-- Nothing is deleted. Every REPORT_REVIEWED_APPROVED audit entry stays exactly
-- where it is, so the fact that a clinician did review these reports remains on
-- the record; what changes is that no future report waits for one.

-- 1. Reports a clinician had already approved. The only thing between them and
--    the patient was a second press of a button that no longer exists, so they
--    are released. releasedAt takes the review time rather than now(): that is
--    when the decision was actually made, and stamping today would put a false
--    turnaround figure on the work queue for every one of them.
UPDATE "Report"
   SET "status" = 'RELEASED',
       "releasedAt" = COALESCE("releasedAt", "reviewedAt", CURRENT_TIMESTAMP)
 WHERE "status" = 'CLINICIAN_REVIEWED';

-- 2. Reports awaiting review: parsed, nothing held, and results actually
--    written. Under the new pipeline these would have released themselves at
--    ingest, so the queue is drained to where automation would have left it.
--
--    THE TWO CONDITIONS ARE BOTH LOAD-BEARING.
--
--    holdReasons = '{}' is the whole safety property: a report with an unmapped
--    analyte, an unrecognised code, an unfiled row, a lab disagreement or a
--    partial delivery STAYS at PARSED and stays in the exception queue. This
--    migration must not do what the running system refuses to do.
--
--    The EXISTS is the one the pipeline itself never has to think about. A PDF
--    report that has been parsed but not yet keyed in sits at PARSED with a
--    preview and NO ReportResult rows — releasing it would put an empty report
--    in front of a patient. Those are left where they are for a person.
UPDATE "Report"
   SET "status" = 'RELEASED',
       "releasedAt" = COALESCE("releasedAt", CURRENT_TIMESTAMP)
 WHERE "status" = 'PARSED'
   AND "voidedAt" IS NULL
   AND "holdReasons" = '{}'
   AND EXISTS (SELECT 1 FROM "ReportResult" rr WHERE rr."reportId" = "Report"."id");

-- 3. Recreate the enum without CLINICIAN_REVIEWED. Postgres cannot drop a value
--    from one in place.
ALTER TYPE "ReportStatus" RENAME TO "ReportStatus_old";
CREATE TYPE "ReportStatus" AS ENUM ('UPLOADED', 'PARSED', 'CHANGES_REQUESTED', 'RELEASED');
ALTER TABLE "Report" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Report"
  ALTER COLUMN "status" TYPE "ReportStatus" USING ("status"::text::"ReportStatus");
ALTER TABLE "Report" ALTER COLUMN "status" SET DEFAULT 'UPLOADED';
DROP TYPE "ReportStatus_old";

-- 4. The release path is now the hot one — every ingest ends in it — and the
--    work queue's "what is not released" question is asked on every load of the
--    console's landing screen. Partial, because RELEASED is the overwhelming
--    majority and is not what either query is looking for.
CREATE INDEX IF NOT EXISTS "Report_open_status_idx"
    ON "Report"("status") WHERE "status" <> 'RELEASED';
