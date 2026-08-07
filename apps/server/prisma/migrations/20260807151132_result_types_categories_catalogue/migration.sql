-- CreateEnum
CREATE TYPE "ResultType" AS ENUM ('MEASURED', 'GENETIC', 'SENSITIVITY', 'COMPOSITION');

-- AlterTable
ALTER TABLE "Marker" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "randoxCode" TEXT,
ADD COLUMN     "resultType" "ResultType" NOT NULL DEFAULT 'MEASURED';

-- AlterTable
ALTER TABLE "Panel" ADD COLUMN     "includesPanelKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "repeatIntervalMonths" INTEGER,
ADD COLUMN     "turnaroundNote" TEXT,
ADD COLUMN     "turnaroundWorkingDays" INTEGER;

-- CreateTable
CREATE TABLE "MarkerCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "randoxId" INTEGER,
    "resultType" "ResultType" NOT NULL DEFAULT 'MEASURED',
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarkerCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkerCategoryMembership" (
    "id" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MarkerCategoryMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarkerCategory_key_key" ON "MarkerCategory"("key");

-- CreateIndex
CREATE INDEX "MarkerCategory_randoxId_idx" ON "MarkerCategory"("randoxId");

-- CreateIndex
CREATE INDEX "MarkerCategoryMembership_categoryId_idx" ON "MarkerCategoryMembership"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "MarkerCategoryMembership_markerId_categoryId_key" ON "MarkerCategoryMembership"("markerId", "categoryId");

-- CreateIndex
CREATE INDEX "Marker_resultType_idx" ON "Marker"("resultType");

-- AddForeignKey
ALTER TABLE "MarkerCategoryMembership" ADD CONSTRAINT "MarkerCategoryMembership_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkerCategoryMembership" ADD CONSTRAINT "MarkerCategoryMembership_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MarkerCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
