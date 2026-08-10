-- A result that cannot be placed against its reference range now has NO
-- status, rather than being written as IN_RANGE because the column demanded
-- one of the five. Widening only: every existing row keeps the value it has,
-- and nothing that reads the column has to change to cope with the new shape
-- beyond handling NULL.
--
-- Historic rows that WERE mis-stamped IN_RANGE are not rewritten here, because
-- the evidence needed to tell them apart (the value itself) is encrypted and
-- unreadable from SQL. They are repaired on read instead: decodeResultValue
-- now recognises a placeholder value as no value, and every patient-facing
-- query drops a result with no value rather than presenting its stamped
-- status. See apps/server/src/lib/resultValue.ts.

ALTER TABLE "ReportResult" ALTER COLUMN "status" DROP NOT NULL;

ALTER TABLE "ReportResultEdit" ALTER COLUMN "previousStatus" DROP NOT NULL;
ALTER TABLE "ReportResultEdit" ALTER COLUMN "newStatus" DROP NOT NULL;
