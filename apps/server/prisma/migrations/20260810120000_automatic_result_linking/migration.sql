-- Automatic result linking.
--
-- A result now attaches to a patient on the order reference we created it
-- under, corroborated by identity, with no manual step. Everything that does
-- not corroborate goes to the queue with a reason. This migration adds the
-- three things that makes possible: the reason, the evidence, and the identity
-- snapshot the corroboration is checked against.
--
-- Additive only. Every column is nullable or defaulted, so existing rows keep
-- their meaning: an UnmatchedResult with no reason is one that predates the
-- reasons, and a RandoxOrder with no identity snapshot cannot be corroborated
-- and is therefore held for an admin — which is the safe direction.

CREATE TYPE "UnmatchedReason" AS ENUM (
  'NO_MATCHING_ORDER',
  'IDENTITY_MISMATCH',
  'NO_PATIENT_ACCOUNT',
  'UNCORROBORATED_IDENTITY',
  'PREVIOUSLY_UNLINKED',
  'DUPLICATE_CANDIDATES'
);

CREATE TYPE "ResultLinkMode" AS ENUM ('AUTOMATIC', 'MANUAL');

ALTER TABLE "UnmatchedResult"
  ADD COLUMN "reason" "UnmatchedReason",
  ADD COLUMN "reasonDetail" TEXT,
  ADD COLUMN "linkMode" "ResultLinkMode",
  ADD COLUMN "linkEvidence" JSONB,
  ADD COLUMN "unlinkedAt" TIMESTAMP(3),
  ADD COLUMN "unlinkedById" TEXT,
  ADD COLUMN "unlinkReason" TEXT,
  ADD COLUMN "autoLinkBlocked" BOOLEAN NOT NULL DEFAULT false;

-- Every row already in the queue was put there by the old flow, which had
-- exactly one way in: no local order record for the result. Naming that
-- explicitly is better than leaving a screenful of "no reason recorded".
UPDATE "UnmatchedResult" SET "reason" = 'NO_MATCHING_ORDER' WHERE "status" = 'PENDING' AND "reason" IS NULL;

-- Rows already linked were linked by a person — the automatic path did not
-- exist. Recording that keeps "who decided this" answerable for them too.
UPDATE "UnmatchedResult" SET "linkMode" = 'MANUAL' WHERE "status" = 'LINKED' AND "linkMode" IS NULL;

CREATE INDEX "UnmatchedResult_status_reason_idx" ON "UnmatchedResult"("status", "reason");

ALTER TABLE "RandoxOrder"
  ADD COLUMN "orderedFirstName" TEXT,
  ADD COLUMN "orderedLastName" TEXT,
  ADD COLUMN "orderedDobEncrypted" TEXT;
