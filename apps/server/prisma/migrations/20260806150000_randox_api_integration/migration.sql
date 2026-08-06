-- Randox API integration: order lifecycle with both Randox identifiers,
-- in-clinic appointments, void-code exclusions, caveat codes and the lab's
-- own high/low indicator, patient measurements, the cached Randox
-- catalogue, and the unknown-code sightings table.

-- AlterEnum
ALTER TYPE "FileKind" ADD VALUE 'RANDOX_RESULT_JSON';

-- CreateEnum
CREATE TYPE "RandoxOrderStatus" AS ENUM ('INCOMPLETE', 'SUBMITTED', 'PENDING_RESULTS', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RandoxCollectionMethod" AS ENUM ('IN_CLINIC', 'HOME_KIT', 'MOBILE_PHLEBOTOMY');

-- CreateEnum
CREATE TYPE "RandoxAppointmentStatus" AS ENUM ('HELD', 'BOOKED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RandoxCatalogueKind" AS ENUM ('PANEL', 'TEST', 'BIOLOGICAL_SEX', 'ETHNICITY', 'TESTING_REASON', 'CANCELLATION_REASON', 'CLINIC_LOCATION');

-- AlterTable
ALTER TABLE "ReportResult" ADD COLUMN     "caveatCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "labStatusIndicator" TEXT,
ADD COLUMN     "labStatusDisagrees" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RandoxOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "randoxOrderId" INTEGER,
    "clinicId" INTEGER,
    "patientId" TEXT NOT NULL,
    "placedById" TEXT,
    "randoxPanelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "randoxTestIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "collectionMethod" "RandoxCollectionMethod" NOT NULL,
    "status" "RandoxOrderStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "rawStatusCode" INTEGER,
    "reportId" TEXT,
    "nextPollAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),
    "pollAttempts" INTEGER NOT NULL DEFAULT 0,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastPollError" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RandoxOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RandoxAppointment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "serviceLocationId" TEXT NOT NULL,
    "serviceLocationName" TEXT,
    "holdReference" TEXT,
    "holdExpiresAt" TIMESTAMP(3),
    "bookingReference" TEXT,
    "startUtc" TIMESTAMP(3) NOT NULL,
    "endUtc" TIMESTAMP(3),
    "status" "RandoxAppointmentStatus" NOT NULL DEFAULT 'HELD',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RandoxAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportResultExclusion" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "markerId" TEXT,
    "rawMarkerName" TEXT NOT NULL,
    "code" TEXT,
    "codeRecognised" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportResultExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportMeasurements" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "heightCm" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "waistCm" DOUBLE PRECISION,
    "hipCm" DOUBLE PRECISION,
    "pulseBpm" INTEGER,
    "systolicBp" INTEGER,
    "diastolicBp" INTEGER,
    "isDiabetic" BOOLEAN,
    "isSmoker" BOOLEAN,
    "knownVascularDisease" BOOLEAN,
    "onMedicationForHypertension" BOOLEAN,
    "ethnicity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportMeasurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RandoxCatalogueEntry" (
    "id" TEXT NOT NULL,
    "kind" "RandoxCatalogueKind" NOT NULL,
    "randoxId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "payload" JSONB,
    "mappedKey" TEXT,
    "mappedAt" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RandoxCatalogueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RandoxUnknownCode" (
    "code" TEXT NOT NULL,
    "sightings" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sampleOrderNumber" TEXT,
    "sampleMarkerName" TEXT,

    CONSTRAINT "RandoxUnknownCode_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "RandoxOrder_orderNumber_key" ON "RandoxOrder"("orderNumber");
CREATE UNIQUE INDEX "RandoxOrder_randoxOrderId_key" ON "RandoxOrder"("randoxOrderId");
CREATE UNIQUE INDEX "RandoxOrder_reportId_key" ON "RandoxOrder"("reportId");
CREATE INDEX "RandoxOrder_patientId_idx" ON "RandoxOrder"("patientId");
CREATE INDEX "RandoxOrder_status_nextPollAt_idx" ON "RandoxOrder"("status", "nextPollAt");

CREATE UNIQUE INDEX "RandoxAppointment_orderId_key" ON "RandoxAppointment"("orderId");
CREATE INDEX "RandoxAppointment_startUtc_idx" ON "RandoxAppointment"("startUtc");

CREATE INDEX "ReportResultExclusion_reportId_idx" ON "ReportResultExclusion"("reportId");
CREATE INDEX "ReportResultExclusion_markerId_idx" ON "ReportResultExclusion"("markerId");
CREATE UNIQUE INDEX "ReportResultExclusion_reportId_rawMarkerName_key" ON "ReportResultExclusion"("reportId", "rawMarkerName");

CREATE UNIQUE INDEX "ReportMeasurements_reportId_key" ON "ReportMeasurements"("reportId");

CREATE INDEX "RandoxCatalogueEntry_kind_isCurrent_idx" ON "RandoxCatalogueEntry"("kind", "isCurrent");
CREATE UNIQUE INDEX "RandoxCatalogueEntry_kind_randoxId_key" ON "RandoxCatalogueEntry"("kind", "randoxId");

CREATE INDEX "RandoxUnknownCode_lastSeenAt_idx" ON "RandoxUnknownCode"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "RandoxOrder" ADD CONSTRAINT "RandoxOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RandoxOrder" ADD CONSTRAINT "RandoxOrder_placedById_fkey" FOREIGN KEY ("placedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RandoxOrder" ADD CONSTRAINT "RandoxOrder_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RandoxAppointment" ADD CONSTRAINT "RandoxAppointment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RandoxOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportResultExclusion" ADD CONSTRAINT "ReportResultExclusion_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportResultExclusion" ADD CONSTRAINT "ReportResultExclusion_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReportMeasurements" ADD CONSTRAINT "ReportMeasurements_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
