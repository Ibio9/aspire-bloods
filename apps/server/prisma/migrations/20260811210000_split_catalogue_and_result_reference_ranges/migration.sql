-- SPLIT "ReferenceRange" INTO THE CATALOGUE AND THE PER-RESULT RECORD.
--
-- One table held two different things: the catalogue of fallbacks the verify
-- form suggests, and one row per result ever materialised recording what that
-- patient's laboratory printed. A seeder's findFirst on marker-and-sex lands on
-- a result record far more often than on a catalogue row, and updating one
-- rewrites a patient's history. That has happened.
--
-- NOTHING IS DELETED. Every row is relocated, keeping its own id, values and
-- createdAt, into whichever table now owns it. Row counts are conserved:
--   ReferenceRange(before) = ReferenceRange(after) + ResultReferenceRange(after)
-- and the DO block at the end refuses to commit if anything went missing.
--
-- CLASSIFICATION. Positive evidence only, and it errs towards the catalogue,
-- because a row wrongly left in the catalogue is visible and correctable while
-- a row wrongly relocated is a fallback that has silently disappeared. A row is
-- a RESULT record if:
--   * a ReportResult points at it (definitive), or
--   * its `source` is one of the machine-generated per-result sentences. Those
--     matter because a re-verify deletes the results and writes new records,
--     leaving the old ones unreferenced — an orphaned result record is
--     indistinguishable from a catalogue row by reference alone, which is why
--     the `results: { none: {} }` guard the application used was never
--     sufficient either. 152 such rows were sitting in the catalogue.
-- Everything else is CATALOGUE, including a row with no source at all (the one
-- in the development database was created through the admin API, and the audit
-- log entry for it says so).

-- 1. The new table. The same shape as the rows it receives, minus the four
--    citation columns: a result record's authority is "the laboratory printed
--    this", which is written out in `source`. Step 3 refuses the migration if a
--    row being relocated actually carries a citation, rather than dropping it.
CREATE TABLE "ResultReferenceRange" (
    "id" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "sex" "Sex" NOT NULL DEFAULT 'ANY',
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "unit" TEXT NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "source" TEXT,
    "provenance" "RangeProvenance" NOT NULL DEFAULT 'UNSOURCED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultReferenceRange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResultReferenceRange_markerId_idx" ON "ResultReferenceRange"("markerId");

-- 2. Which rows move. Materialised so the classification is computed once and
--    every later step, including the conservation check, agrees with it.
CREATE TEMP TABLE "_range_split" AS
SELECT
    r.id,
    (
        EXISTS (SELECT 1 FROM "ReportResult" rr WHERE rr."referenceRangeId" = r.id)
        OR COALESCE(r."source", '') ~ ', verified [0-9]{4}-[0-9]{2}-[0-9]{2} \((demo )?report '
        OR COALESCE(r."source", '') ~ ', ingested [0-9]{4}-[0-9]{2}-[0-9]{2}'
        OR COALESCE(r."source", '') LIKE 'DEMO DATA%'
        OR COALESCE(r."source", '') LIKE 'Result record. An earlier seed run overwrote%'
    ) AS is_result
FROM "ReferenceRange" r;

-- 3. Refuse rather than lose. Stop before anything has moved.
DO $$
DECLARE with_citation INTEGER;
BEGIN
    SELECT count(*) INTO with_citation
    FROM "ReferenceRange" r JOIN "_range_split" s ON s.id = r.id
    WHERE s.is_result
      AND (r."sourceDocument" IS NOT NULL OR r."sourcePublisher" IS NOT NULL
           OR r."sourceDate" IS NOT NULL OR r."sourceUrl" IS NOT NULL);
    IF with_citation > 0 THEN
        RAISE EXCEPTION
            '% reference range row(s) classified as per-result records carry a citation. A result record has no column for one, so this migration will not silently drop them. Inspect them before re-running.',
            with_citation;
    END IF;
END $$;

-- 4. A record belongs to ONE result. No code has ever shared one and no row in
--    this database is shared, but the new schema makes that a database fact, so
--    a shared row is COPIED per extra result rather than blocking the unique
--    index. The original row stays where it is; the extra results get their own
--    copy, keyed by the result's own id (already a uuid, already unique).
CREATE TEMP TABLE "_range_clone" AS
SELECT rr."id" AS result_id, rr."referenceRangeId" AS range_id
FROM (
    SELECT "id", "referenceRangeId",
           row_number() OVER (PARTITION BY "referenceRangeId" ORDER BY "id") AS n
    FROM "ReportResult"
) rr
WHERE rr.n > 1;

INSERT INTO "ReferenceRange" ("id", "markerId", "sex", "ageMin", "ageMax", "unit", "low", "high", "source", "provenance", "sourceDocument", "sourcePublisher", "sourceDate", "sourceUrl", "createdAt")
SELECT c.result_id, r."markerId", r."sex", r."ageMin", r."ageMax", r."unit", r."low", r."high",
       COALESCE(r."source", '') || ' [copied at the catalogue/result split so this result keeps its own record]',
       r."provenance", r."sourceDocument", r."sourcePublisher", r."sourceDate", r."sourceUrl", r."createdAt"
FROM "_range_clone" c JOIN "ReferenceRange" r ON r.id = c.range_id;

UPDATE "ReportResult" rr SET "referenceRangeId" = c.result_id
FROM "_range_clone" c WHERE rr."id" = c.result_id;

INSERT INTO "_range_split" (id, is_result) SELECT c.result_id, TRUE FROM "_range_clone" c;

-- 5. Move the per-result records across, id and all.
INSERT INTO "ResultReferenceRange" ("id", "markerId", "sex", "ageMin", "ageMax", "unit", "low", "high", "source", "provenance", "createdAt")
SELECT r."id", r."markerId", r."sex", r."ageMin", r."ageMax", r."unit", r."low", r."high", r."source", r."provenance", r."createdAt"
FROM "ReferenceRange" r
JOIN "_range_split" s ON s.id = r.id
WHERE s.is_result;

-- 6. Repoint the foreign key at the table that now owns those rows. RESTRICT
--    stays, for the reason it was there before: it is what stopped a bulk delete
--    of range rows walking through live patient data.
ALTER TABLE "ReportResult" DROP CONSTRAINT "ReportResult_referenceRangeId_fkey";

DELETE FROM "ReferenceRange" r USING "_range_split" s WHERE s.id = r.id AND s.is_result;

CREATE UNIQUE INDEX "ReportResult_referenceRangeId_key" ON "ReportResult"("referenceRangeId");

ALTER TABLE "ResultReferenceRange" ADD CONSTRAINT "ResultReferenceRange_markerId_fkey"
    FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportResult" ADD CONSTRAINT "ReportResult_referenceRangeId_fkey"
    FOREIGN KEY ("referenceRangeId") REFERENCES "ResultReferenceRange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ReferenceRange_markerId_sex_idx" ON "ReferenceRange"("markerId", "sex");

-- 7. Conservation. Every row that existed still exists, in one table or the
--    other, and every result still points at a record of its own.
DO $$
DECLARE before_total INTEGER; catalogue_total INTEGER; result_total INTEGER; orphan_results INTEGER;
BEGIN
    SELECT count(*) INTO before_total FROM "_range_split";
    SELECT count(*) INTO catalogue_total FROM "ReferenceRange";
    SELECT count(*) INTO result_total FROM "ResultReferenceRange";
    SELECT count(*) INTO orphan_results FROM "ReportResult" rr
        WHERE NOT EXISTS (SELECT 1 FROM "ResultReferenceRange" x WHERE x.id = rr."referenceRangeId");

    IF orphan_results > 0 THEN
        RAISE EXCEPTION '% result(s) lost their reference range record in the split.', orphan_results;
    END IF;
    IF catalogue_total + result_total <> before_total THEN
        RAISE EXCEPTION 'Reference range rows went missing: % before (including copies), % catalogue + % per-result after.',
            before_total, catalogue_total, result_total;
    END IF;
    RAISE NOTICE 'Reference ranges split: % row(s) -> % catalogue + % per-result.',
        before_total, catalogue_total, result_total;
END $$;

DROP TABLE "_range_split";
DROP TABLE "_range_clone";
