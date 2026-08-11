-- CreateEnum
CREATE TYPE "RangeProvenance" AS ENUM ('RANDOX', 'PUBLISHED', 'UNSOURCED');

-- AlterTable
ALTER TABLE "ReferenceRange" ADD COLUMN     "provenance" "RangeProvenance" NOT NULL DEFAULT 'UNSOURCED',
ADD COLUMN     "sourceDate" TEXT,
ADD COLUMN     "sourceDocument" TEXT,
ADD COLUMN     "sourcePublisher" TEXT,
ADD COLUMN     "sourceUrl" TEXT;
