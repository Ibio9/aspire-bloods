-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'ADMIN', 'CLINICIAN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "TwoFactorMethod" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'ANY');

-- CreateEnum
CREATE TYPE "MarkerReviewStatus" AS ENUM ('DRAFT', 'REVIEWED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('UPLOADED', 'PARSED', 'ADMIN_VERIFIED', 'CHANGES_REQUESTED', 'CLINICIAN_REVIEWED', 'RELEASED');

-- CreateEnum
CREATE TYPE "MarkerStatus" AS ENUM ('IN_RANGE', 'HIGH', 'LOW', 'SIGNIFICANT_HIGH', 'SIGNIFICANT_LOW');

-- CreateEnum
CREATE TYPE "EscalationSeverity" AS ENUM ('MILD', 'SIGNIFICANT');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('DATA_PROCESSING', 'RESULTS_STORAGE', 'COMMS_EMAIL', 'COMMS_SMS');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('RANDOX_PDF', 'ASPIRE_SUMMARY_PDF');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ErasureStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "twoFactorMethod" "TwoFactorMethod" NOT NULL DEFAULT 'EMAIL',
    "phoneNumberEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "sex" "Sex",
    "dobEncrypted" TEXT NOT NULL,
    "contactNumberEncrypted" TEXT NOT NULL,
    "addressEncrypted" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "gpName" TEXT,
    "gpAddressEncrypted" TEXT,
    "medicationEncrypted" TEXT,
    "allergiesEncrypted" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactNumberEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "postNominals" TEXT,
    "roleTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "channel" "TwoFactorMethod" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceIdHash" TEXT NOT NULL,
    "trustedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentVersion" (
    "id" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "version" INTEGER NOT NULL,
    "bodyText" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consentVersionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Panel" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Panel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Marker" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultUnit" TEXT NOT NULL,
    "severityMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "severityAbsoluteDelta" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Marker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanelMarker" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isAddOn" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PanelMarker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceRange" (
    "id" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "sex" "Sex" NOT NULL DEFAULT 'ANY',
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "unit" TEXT NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceRange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkerExplanation" (
    "id" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "whatItIs" TEXT NOT NULL,
    "highMeans" TEXT,
    "lowMeans" TEXT,
    "lifestyleContext" TEXT,
    "reviewStatus" "MarkerReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarkerExplanation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "sampleDate" TIMESTAMP(3) NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ReportStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploadedById" TEXT NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "originalPdfFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportResult" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "valueEncrypted" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "referenceRangeId" TEXT NOT NULL,
    "status" "MarkerStatus" NOT NULL,
    "rawParsedValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedForReportId" TEXT,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationEvent" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "severity" "EscalationSeverity" NOT NULL,
    "channelsNotified" TEXT[],
    "flaggedMarkerIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "EscalationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopyBlock" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopyBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "retentionPeriodDays" INTEGER NOT NULL,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErasureRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ErasureStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeScheduledAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "ErasureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_userId_key" ON "PatientProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InviteToken_tokenHash_key" ON "InviteToken"("tokenHash");

-- CreateIndex
CREATE INDEX "InviteToken_userId_idx" ON "InviteToken"("userId");

-- CreateIndex
CREATE INDEX "OtpCode_userId_idx" ON "OtpCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrustedDevice_userId_deviceIdHash_key" ON "TrustedDevice"("userId", "deviceIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentVersion_type_version_key" ON "ConsentVersion"("type", "version");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_idx" ON "ConsentRecord"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Panel_key_key" ON "Panel"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Marker_key_key" ON "Marker"("key");

-- CreateIndex
CREATE INDEX "PanelMarker_markerId_idx" ON "PanelMarker"("markerId");

-- CreateIndex
CREATE UNIQUE INDEX "PanelMarker_panelId_markerId_key" ON "PanelMarker"("panelId", "markerId");

-- CreateIndex
CREATE INDEX "ReferenceRange_markerId_idx" ON "ReferenceRange"("markerId");

-- CreateIndex
CREATE UNIQUE INDEX "MarkerExplanation_markerId_key" ON "MarkerExplanation"("markerId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_originalPdfFileId_key" ON "Report"("originalPdfFileId");

-- CreateIndex
CREATE INDEX "Report_patientId_idx" ON "Report"("patientId");

-- CreateIndex
CREATE INDEX "Report_panelId_idx" ON "Report"("panelId");

-- CreateIndex
CREATE INDEX "ReportResult_markerId_idx" ON "ReportResult"("markerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportResult_reportId_markerId_key" ON "ReportResult"("reportId", "markerId");

-- CreateIndex
CREATE INDEX "StoredFile_generatedForReportId_idx" ON "StoredFile"("generatedForReportId");

-- CreateIndex
CREATE INDEX "EscalationEvent_reportId_idx" ON "EscalationEvent"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "CopyBlock_slug_key" ON "CopyBlock"("slug");

-- CreateIndex
CREATE INDEX "AuditLogEntry_actorUserId_idx" ON "AuditLogEntry"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_createdAt_idx" ON "AuditLogEntry"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLogEntry_targetType_targetId_idx" ON "AuditLogEntry"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_dataType_key" ON "RetentionPolicy"("dataType");

-- CreateIndex
CREATE INDEX "ErasureRequest_userId_idx" ON "ErasureRequest"("userId");

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteToken" ADD CONSTRAINT "InviteToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_consentVersionId_fkey" FOREIGN KEY ("consentVersionId") REFERENCES "ConsentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelMarker" ADD CONSTRAINT "PanelMarker_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "Panel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelMarker" ADD CONSTRAINT "PanelMarker_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceRange" ADD CONSTRAINT "ReferenceRange_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkerExplanation" ADD CONSTRAINT "MarkerExplanation_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "Panel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_originalPdfFileId_fkey" FOREIGN KEY ("originalPdfFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportResult" ADD CONSTRAINT "ReportResult_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportResult" ADD CONSTRAINT "ReportResult_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "Marker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportResult" ADD CONSTRAINT "ReportResult_referenceRangeId_fkey" FOREIGN KEY ("referenceRangeId") REFERENCES "ReferenceRange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_generatedForReportId_fkey" FOREIGN KEY ("generatedForReportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationEvent" ADD CONSTRAINT "EscalationEvent_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErasureRequest" ADD CONSTRAINT "ErasureRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
