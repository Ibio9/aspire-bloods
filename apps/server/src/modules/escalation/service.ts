import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import { emailProvider, smsProvider, isSmsEnabled } from '../notifications/index.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { formatDate, formatReportTitle } from '@aspire-bloods/shared';

const SIGNIFICANT_STATUSES = new Set(['SIGNIFICANT_HIGH', 'SIGNIFICANT_LOW']);
const OUT_OF_RANGE_STATUSES = new Set(['HIGH', 'LOW', 'SIGNIFICANT_HIGH', 'SIGNIFICANT_LOW']);

/**
 * Runs immediately after a report is released (brief §5): if anything is
 * out of range, notify the practice — email always, SMS only when
 * SMS_ENABLED and only as a "review required" ping with no clinical
 * values, per the brief's explicit instruction never to put results in an
 * SMS body.
 */
export async function checkAndEscalate(reportId: string): Promise<void> {
  const report = await prisma.report.findUniqueOrThrow({
    where: { id: reportId },
    include: {
      panel: true,
      patient: { include: { patientProfile: true } },
      results: { include: { marker: true } },
    },
  });

  const flagged = report.results.filter((r) => OUT_OF_RANGE_STATUSES.has(r.status));
  if (flagged.length === 0) return;

  const severity = flagged.some((r) => SIGNIFICANT_STATUSES.has(r.status)) ? 'SIGNIFICANT' : 'MILD';
  const patientName = report.patient.patientProfile
    ? `${report.patient.patientProfile.firstName} ${report.patient.patientProfile.lastName}`
    : report.patient.email;
  const markerNames = flagged.map((r) => r.marker.name).join(', ');
  const portalLink = `${env.APP_BASE_URL}/admin/reports/${reportId}`;
  // Marker names only, never values — and the report title falls back
  // cleanly when the report has no panel behind it.
  const reportTitle = formatReportTitle(report.panel?.name, report.results.length, report.sampleDate);

  const channels: string[] = ['EMAIL'];
  const urgencyLabel = severity === 'SIGNIFICANT' ? 'Significant result, review urgently' : 'Result outside range';

  await emailProvider.sendEmail({
    to: env.ESCALATION_EMAIL,
    subject: `[Aspire Bloods] ${urgencyLabel}: ${patientName}`,
    text: `${urgencyLabel} for ${patientName} (${reportTitle}, sample taken ${formatDate(report.sampleDate)}).\n\nFlagged markers: ${markerNames}\n\nReview: ${portalLink}`,
    html: `<p><strong>${urgencyLabel}</strong> for ${patientName} (${reportTitle}, sample taken ${formatDate(report.sampleDate)}).</p><p>Flagged markers: ${markerNames}</p><p><a href="${portalLink}">Review in the admin portal</a></p>`,
  });

  if (isSmsEnabled() && env.ESCALATION_SMS_NUMBER) {
    channels.push('SMS');
    await smsProvider.sendSms({
      to: env.ESCALATION_SMS_NUMBER,
      body: `Aspire Bloods: ${severity === 'SIGNIFICANT' ? 'urgent review required' : 'review required'} for a released report. ${portalLink}`,
    });
  }

  await prisma.escalationEvent.create({
    data: {
      reportId,
      severity,
      channelsNotified: channels,
      flaggedMarkerIds: flagged.map((r) => r.markerId),
    },
  });

  await recordAuditLog({
    actorType: 'SYSTEM',
    action: 'ESCALATION_TRIGGERED',
    targetType: 'Report',
    targetId: reportId,
    metadata: { severity, markerCount: flagged.length, channels },
  });
}
