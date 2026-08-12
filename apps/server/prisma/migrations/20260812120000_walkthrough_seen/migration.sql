-- The first sign-in walkthrough, tracked against the patient record.
--
-- Nullable and defaulted to NULL rather than backfilled to now(): an existing
-- patient has NOT seen the introduction, and pretending otherwise would hide it
-- from every patient the practice already has, which is the only population it
-- currently matters to. They see it once, on their next sign-in, and then never
-- again.
ALTER TABLE "User" ADD COLUMN "walkthroughSeenAt" TIMESTAMP(3);
