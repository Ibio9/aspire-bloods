-- Added in its own migration on purpose: Postgres will not let a newly added
-- enum value be USED in the same transaction that adds it, and Prisma runs one
-- migration per transaction. Splitting keeps the next migration free to
-- reference 'PENDING_VERIFICATION' if it ever needs to.
ALTER TYPE "UserStatus" ADD VALUE 'PENDING_VERIFICATION';
