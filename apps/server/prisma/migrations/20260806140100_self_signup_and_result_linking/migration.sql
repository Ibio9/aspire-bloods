-- Self-signup captures name, DOB and contact number; address and postcode are
-- asked for at invite-activation but are not part of what an admin matches an
-- incoming result against, so they stop being mandatory.
ALTER TABLE "PatientProfile" ALTER COLUMN "addressEncrypted" DROP NOT NULL;
ALTER TABLE "PatientProfile" ALTER COLUMN "postcode" DROP NOT NULL;

-- Email verification for self-registered accounts.
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

ALTER TABLE "EmailVerificationToken"
    ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Results that arrived with nobody to attach them to.
CREATE TYPE "UnmatchedResultStatus" AS ENUM ('PENDING', 'LINKED', 'DISMISSED');

CREATE TABLE "UnmatchedResult" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "externalId" TEXT,
    "claimedFirstName" TEXT,
    "claimedLastName" TEXT,
    "claimedDobEncrypted" TEXT,
    "claimedContactNumberEncrypted" TEXT,
    "sampleDate" TIMESTAMP(3),
    "markerCount" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "status" "UnmatchedResultStatus" NOT NULL DEFAULT 'PENDING',
    "linkedReportId" TEXT,
    "linkedPatientId" TEXT,
    "linkedById" TEXT,
    "linkedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "dismissedById" TEXT,
    "dismissReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnmatchedResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnmatchedResult_externalId_key" ON "UnmatchedResult"("externalId");
CREATE INDEX "UnmatchedResult_status_idx" ON "UnmatchedResult"("status");
CREATE INDEX "UnmatchedResult_sourceKey_idx" ON "UnmatchedResult"("sourceKey");
