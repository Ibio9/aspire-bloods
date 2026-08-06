-- Email verification becomes a six-digit code rather than a clickable link,
-- matching how 2FA already works.
--
-- The old rows are single-use link tokens with no code behind them, so there
-- is nothing to migrate: the table is replaced outright. Anyone still holding
-- an unopened link is left in PENDING_VERIFICATION and asks for a code from
-- the confirm-your-email screen, which is the same repair they already had
-- when a link expired.
DROP TABLE "EmailVerificationToken";

CREATE TABLE "EmailVerificationCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationCode_pkey" PRIMARY KEY ("id")
);

-- Deliberately no unique index on codeHash: six digits collide across a user
-- base, and a unique constraint would turn a collision into a registration
-- that fails for reasons the patient can never act on.
CREATE INDEX "EmailVerificationCode_userId_idx" ON "EmailVerificationCode"("userId");

ALTER TABLE "EmailVerificationCode"
    ADD CONSTRAINT "EmailVerificationCode_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
