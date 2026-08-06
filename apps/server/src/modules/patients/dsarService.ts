import { ZipArchive } from 'archiver';
import { prisma } from '../../db/client.js';
import { decryptField } from '../../lib/crypto.js';
import { storageAdapter } from '../storage/LocalDiskStorageAdapter.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { reportTitle } from '@aspire-bloods/shared';

/**
 * One-click full data export (brief §6, DSAR support): every held record
 * that traces back to this patient, plus the original files, bundled as a
 * zip. JSON is decrypted at the point of export — this is the patient's
 * own data, requested by the patient, not stored decrypted anywhere.
 */
export async function buildDsarExport(patientId: string): Promise<NodeJS.ReadableStream> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: patientId },
    include: { patientProfile: true },
  });

  const reports = await prisma.report.findMany({
    where: { patientId },
    include: {
      panel: true,
      results: { include: { marker: true, referenceRange: true } },
      originalPdfFile: true,
    },
  });

  const consents = await prisma.consentRecord.findMany({
    where: { userId: patientId },
    include: { consentVersion: true },
    orderBy: { createdAt: 'asc' },
  });

  const auditEntries = await prisma.auditLogEntry.findMany({
    where: {
      OR: [
        { actorUserId: patientId },
        { targetType: 'User', targetId: patientId },
        { targetType: 'Report', targetId: { in: reports.map((r) => r.id) } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  const profile = user.patientProfile;
  const profileJson = {
    email: user.email,
    status: user.status,
    createdAt: user.createdAt,
    profile: profile
      ? {
          title: profile.title,
          firstName: profile.firstName,
          lastName: profile.lastName,
          sex: profile.sex,
          dateOfBirth: decryptField(profile.dobEncrypted),
          contactNumber: decryptField(profile.contactNumberEncrypted),
          address: decryptField(profile.addressEncrypted),
          postcode: profile.postcode,
          gpName: profile.gpName,
          gpAddress: profile.gpAddressEncrypted ? decryptField(profile.gpAddressEncrypted) : null,
          medication: profile.medicationEncrypted ? decryptField(profile.medicationEncrypted) : null,
          allergies: profile.allergiesEncrypted ? decryptField(profile.allergiesEncrypted) : null,
          emergencyContactName: profile.emergencyContactName,
          emergencyContactNumber: profile.emergencyContactNumberEncrypted
            ? decryptField(profile.emergencyContactNumberEncrypted)
            : null,
        }
      : null,
  };

  const reportsJson = reports.map((r) => ({
    reportId: r.id,
    panel: r.panel?.name ?? null,
    title: reportTitle(r.panel?.name, r.sampleDate.toISOString(), r.results.length),
    sampleDate: r.sampleDate,
    status: r.status,
    releasedAt: r.releasedAt,
    results: r.results.map((res) => ({
      marker: res.marker.name,
      value: Number(decryptField(res.valueEncrypted)),
      unit: res.unit,
      referenceLow: res.referenceRange.low,
      referenceHigh: res.referenceRange.high,
      status: res.status,
    })),
  }));

  const consentsJson = consents.map((c) => ({
    type: c.consentVersion.type,
    version: c.consentVersion.version,
    granted: c.granted,
    grantedAt: c.createdAt,
    withdrawnAt: c.withdrawnAt,
    consentText: c.consentVersion.bodyText,
    ipAddress: c.ipAddress,
  }));

  const auditJson = auditEntries.map((a) => ({
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId,
    createdAt: a.createdAt,
  }));

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.append(JSON.stringify(profileJson, null, 2), { name: 'profile.json' });
  archive.append(JSON.stringify(reportsJson, null, 2), { name: 'reports.json' });
  archive.append(JSON.stringify(consentsJson, null, 2), { name: 'consents.json' });
  archive.append(JSON.stringify(auditJson, null, 2), { name: 'audit-log.json' });

  for (const r of reports) {
    if (r.originalPdfFile) {
      try {
        const buf = await storageAdapter.read(r.originalPdfFile.storageKey);
        archive.append(buf, {
          name: `files/${r.sampleDate.toISOString().slice(0, 10)}-${r.panel?.key ?? 'no-panel'}-${r.id.slice(0, 8)}-original.pdf`,
        });
      } catch {
        // file missing on disk — skip rather than fail the whole export
      }
    }
  }

  await recordAuditLog({
    actorUserId: patientId,
    action: 'DSAR_EXPORT_GENERATED',
    targetType: 'User',
    targetId: patientId,
  });

  archive.finalize();
  return archive;
}
