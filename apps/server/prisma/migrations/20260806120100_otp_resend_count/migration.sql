-- Tracks how many times a code has been reissued within one login attempt,
-- so the resend flow can offer a way out (call the clinic) rather than
-- letting a patient loop on an address that isn't receiving.
ALTER TABLE "OtpCode" ADD COLUMN "resendCount" INTEGER NOT NULL DEFAULT 0;
