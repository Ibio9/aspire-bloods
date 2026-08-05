-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "ReportResult" ADD COLUMN     "amendedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" TEXT,
ADD COLUMN     "deactivationReason" TEXT;

-- CreateTable
CREATE TABLE "ReportResultEdit" (
    "id" TEXT NOT NULL,
    "reportResultId" TEXT NOT NULL,
    "previousValueEncrypted" TEXT NOT NULL,
    "previousUnit" TEXT NOT NULL,
    "previousStatus" "MarkerStatus" NOT NULL,
    "newValueEncrypted" TEXT NOT NULL,
    "newUnit" TEXT NOT NULL,
    "newStatus" "MarkerStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportResultEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportResultEdit_reportResultId_idx" ON "ReportResultEdit"("reportResultId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportResultEdit" ADD CONSTRAINT "ReportResultEdit_reportResultId_fkey" FOREIGN KEY ("reportResultId") REFERENCES "ReportResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportResultEdit" ADD CONSTRAINT "ReportResultEdit_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
