-- The outcome of the last boot-mode demo-data seed, so a swallowed failure is
-- diagnosable from the admin console instead of only from the deploy logs.
-- One row, keyed on a constant, overwritten every boot.
CREATE TYPE "DemoSeedOutcome" AS ENUM ('SKIPPED', 'SUCCEEDED', 'FAILED');

CREATE TABLE "DemoSeedRun" (
    "id" TEXT NOT NULL DEFAULT 'last',
    "outcome" "DemoSeedOutcome" NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER,
    "reportsCreated" INTEGER NOT NULL DEFAULT 0,
    "patientEmail" TEXT,
    "detail" TEXT NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "DemoSeedRun_pkey" PRIMARY KEY ("id")
);
