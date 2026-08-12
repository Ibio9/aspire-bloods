-- Whether the nightly off-platform backup actually ran.
--
-- The R2 bucket was found empty, 0 B, 0 operations: the script was correct and
-- had never been deployed. Nothing in the product could have said so, because
-- the only evidence a backup produced was a log line in a service that did not
-- exist. The job now writes a row here over the same private DATABASE_URL it
-- uses to take the dump, and the clinician work queue reads the latest one.
CREATE TYPE "BackupOutcome" AS ENUM ('SUCCEEDED', 'FAILED');

CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "outcome" "BackupOutcome" NOT NULL,
    "objectKey" TEXT,
    "sizeBytes" BIGINT,
    "uncompressedBytes" BIGINT,
    "sha256" TEXT,
    "failureStage" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BackupRun_startedAt_idx" ON "BackupRun"("startedAt");
CREATE INDEX "BackupRun_outcome_startedAt_idx" ON "BackupRun"("outcome", "startedAt");
