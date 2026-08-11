-- Every analyte STRING Randox has actually sent, and what became of it.
--
-- The analyte map resolved 186 markers from their own catalogue names and had
-- been checked against zero real payloads. This table is what turns that from
-- an assumption into a count: a row per distinct (analyte, sampleType) seen in
-- a real delivery, RESOLVED where the map answered and UNMAPPED where it did
-- not. The UNMAPPED rows are the exception queue; a row an admin accepts is
-- stamped via = 'ADMIN' and becomes the learned mapping the ingestion path
-- reads on the next delivery.
CREATE TYPE "RandoxAnalyteStatus" AS ENUM ('RESOLVED', 'UNMAPPED');

CREATE TABLE "RandoxAnalyteObservation" (
    "id" TEXT NOT NULL,
    "analyte" TEXT NOT NULL,
    "normalised" TEXT NOT NULL,
    "sampleType" TEXT,
    -- sampleType is nullable and Postgres treats NULLs as distinct in a unique
    -- index, so a unique constraint on (normalised, sampleType) would let an
    -- unqualified analyte create a new row on every delivery. The composite is
    -- built in application code and has no such hole.
    "identity" TEXT NOT NULL,
    "group" TEXT,
    "displayName" TEXT,
    "sampleOrderNumber" TEXT,
    "status" "RandoxAnalyteStatus" NOT NULL,
    "via" TEXT,
    "markerId" TEXT,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "sightings" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RandoxAnalyteObservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RandoxAnalyteObservation_identity_key" ON "RandoxAnalyteObservation"("identity");
CREATE INDEX "RandoxAnalyteObservation_status_lastSeenAt_idx" ON "RandoxAnalyteObservation"("status", "lastSeenAt");
CREATE INDEX "RandoxAnalyteObservation_markerId_idx" ON "RandoxAnalyteObservation"("markerId");

ALTER TABLE "RandoxAnalyteObservation"
  ADD CONSTRAINT "RandoxAnalyteObservation_markerId_fkey"
  FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RandoxAnalyteObservation"
  ADD CONSTRAINT "RandoxAnalyteObservation_acceptedById_fkey"
  FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
