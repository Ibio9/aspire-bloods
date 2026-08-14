import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import { emailProvider, smsProvider, isSmsEnabled } from '../notifications/index.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { formatDate, formatReportTitle } from '@aspire-bloods/shared';

const SIGNIFICANT_STATUSES = new Set(['SIGNIFICANT_HIGH', 'SIGNIFICANT_LOW']);
const OUT_OF_RANGE_STATUSES = new Set(['HIGH', 'LOW', 'SIGNIFICANT_HIGH', 'SIGNIFICANT_LOW']);

/**
 * ============================================================================
 *  ESCALATION FIRES BEFORE THE RELEASE COMMITS (changed Aug 2026).
 * ============================================================================
 *
 * It used to run AFTER a successful release, from the route, on the reasoning
 * that a notification failure must not surface as a release failure. That
 * reasoning is still right and is still honoured — see the catch in
 * releaseReport — but the ORDER was wrong the moment release stopped being a
 * human act.
 *
 * With a clinician gate, "release" meant a clinician had already read the
 * report; the escalation was telling the practice about something one of their
 * own people had just done. With automatic release, the patient and the clinic
 * learn at the same moment, so anything that arrives at the clinic AFTER the
 * release is an email about a conversation the patient may already be having.
 *
 * So `checkAndEscalate` is awaited BEFORE the status write, by releaseReport
 * itself rather than by the two routes that used to remember to call it. The
 * clinic's mail is out of this process before the report becomes visible.
 *
 * WHAT IT DOES NOT DO IS BLOCK THE RELEASE. If the mail provider is down the
 * failure is caught, audited as ESCALATION_FAILED, and the release proceeds. The
 * whole argument for automatic release is that a result nobody can see is the
 * worse outcome; making it conditional on an email provider would reintroduce
 * exactly that, with a third party holding the switch.
 */

export type EscalationSeverity = 'SIGNIFICANT' | 'MILD';

export interface EscalationOutcome {
  /** False when nothing on the report was outside its range — the common case. */
  escalated: boolean;
  severity: EscalationSeverity | null;
  flaggedCount: number;
  significantCount: number;
  channels: string[];
}

const NOT_ESCALATED: EscalationOutcome = {
  escalated: false,
  severity: null,
  flaggedCount: 0,
  significantCount: 0,
  channels: [],
};

/**
 * If anything on this report is out of range, notify the practice — email
 * always, SMS only when SMS_ENABLED, and only ever as a "review required" ping
 * with no clinical values in it, per the brief's explicit instruction never to
 * put results in an SMS body.
 *
 * SEVERITY IS NOT A LABEL, IT CHANGES WHAT ARRIVES. A significantly out-of-range
 * result and a mildly out-of-range one used to differ by four words in a subject
 * line and one word in an SMS, which on a busy morning is no difference at all.
 * They now differ in the three places a difference is actually noticed:
 *
 *   · the SUBJECT leads with URGENT and names the count, so the inbox list
 *     sorts by eye;
 *   · the mail carries `Importance: high` / `X-Priority: 1`, which is what makes
 *     a client draw it differently — set on SIGNIFICANT only, because a sender
 *     that marks everything important is one nobody believes twice;
 *   · the BODY splits the two groups. "Significantly outside range: Ferritin"
 *     followed by "Also outside range: ALT, GGT" is a triage instruction; one
 *     comma-separated list of five markers is a list.
 */
export async function checkAndEscalate(reportId: string): Promise<EscalationOutcome> {
  const report = await prisma.report.findUniqueOrThrow({
    where: { id: reportId },
    include: {
      panel: true,
      patient: { include: { patientProfile: true } },
      results: { include: { marker: true } },
    },
  });

  // A result with no status was never compared to a range, so it cannot be
  // outside one. Escalating on it would call a clinician about a marker that
  // has no finding attached to it.
  const flagged = report.results.filter((r) => r.status !== null && OUT_OF_RANGE_STATUSES.has(r.status));
  if (flagged.length === 0) return NOT_ESCALATED;

  const significant = flagged.filter((r) => r.status !== null && SIGNIFICANT_STATUSES.has(r.status));
  const mild = flagged.filter((r) => !significant.includes(r));
  const severity: EscalationSeverity = significant.length > 0 ? 'SIGNIFICANT' : 'MILD';

  const patientName = report.patient.patientProfile
    ? `${report.patient.patientProfile.firstName} ${report.patient.patientProfile.lastName}`
    : report.patient.email;
  const portalLink = `${env.APP_BASE_URL}/admin/reports/${reportId}`;
  // Marker names only, never values — and the report title falls back
  // cleanly when the report has no panel behind it.
  const reportTitle = formatReportTitle(report.panel?.name, report.results.length, report.sampleDate);
  const names = (rows: typeof flagged) => rows.map((r) => r.marker.name).join(', ');

  const subject =
    severity === 'SIGNIFICANT'
      ? `[Aspire Bloods] URGENT — ${significant.length} result${significant.length === 1 ? '' : 's'} significantly outside range: ${patientName}`
      : `[Aspire Bloods] Result outside range: ${patientName}`;

  /**
   * THE SENTENCE THAT CHANGED WITH THE PIPELINE, and it is the important one.
   *
   * This email used to reach somebody who was about to decide whether the
   * patient could see the report. Now the report is released as this is sent, so
   * the clinician's question is not "should this go out" but "does this need a
   * call today" — and they have to know the patient is looking at the same thing
   * they are. Saying so is not a warning, it is the context the rest of the mail
   * is read in.
   */
  const releaseNote =
    'This report is being released to the patient now, so they can see these results as well.';

  const lines = [
    severity === 'SIGNIFICANT'
      ? `${significant.length} result${significant.length === 1 ? ' is' : 's are'} SIGNIFICANTLY outside range for ${patientName} (${reportTitle}, sample taken ${formatDate(report.sampleDate)}).`
      : `${flagged.length} result${flagged.length === 1 ? ' is' : 's are'} outside range for ${patientName} (${reportTitle}, sample taken ${formatDate(report.sampleDate)}).`,
    '',
    ...(significant.length > 0 ? [`Significantly outside range: ${names(significant)}`] : []),
    ...(mild.length > 0
      ? [significant.length > 0 ? `Also outside range: ${names(mild)}` : `Outside range: ${names(mild)}`]
      : []),
    '',
    releaseNote,
    '',
    `Review: ${portalLink}`,
  ];

  const html = [
    `<p><strong>${lines[0]}</strong></p>`,
    ...(significant.length > 0 ? [`<p><strong>Significantly outside range:</strong> ${names(significant)}</p>`] : []),
    ...(mild.length > 0
      ? [
          `<p>${significant.length > 0 ? 'Also outside range' : 'Outside range'}: ${names(mild)}</p>`,
        ]
      : []),
    `<p>${releaseNote}</p>`,
    `<p><a href="${portalLink}">Open this report in the clinician console</a></p>`,
  ].join('');

  const channels: string[] = ['EMAIL'];
  await emailProvider.sendEmail({
    to: env.ESCALATION_EMAIL,
    subject,
    text: lines.join('\n'),
    html,
    // SIGNIFICANT only. See the note above on why this is not set on every one.
    ...(severity === 'SIGNIFICANT'
      ? { headers: { Importance: 'high', 'X-Priority': '1', 'X-MSMail-Priority': 'High' } }
      : {}),
  });

  if (isSmsEnabled() && env.ESCALATION_SMS_NUMBER) {
    channels.push('SMS');
    await smsProvider.sendSms({
      to: env.ESCALATION_SMS_NUMBER,
      // Still no clinical values, and still no marker names — an SMS is a ping
      // at a phone that may be on a table in a waiting room. What the two
      // severities differ in is the instruction, not the content.
      body:
        severity === 'SIGNIFICANT'
          ? `Aspire Bloods: URGENT. A report released to a patient has results significantly outside range. Review now: ${portalLink}`
          : `Aspire Bloods: a report released to a patient has results outside range. Review: ${portalLink}`,
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
    metadata: {
      severity,
      markerCount: flagged.length,
      significantCount: significant.length,
      channels,
      // Recorded because the ORDER is the guarantee, and an audit trail that
      // cannot distinguish "before" from "after" cannot show it was kept.
      beforeRelease: true,
    },
  });

  return {
    escalated: true,
    severity,
    flaggedCount: flagged.length,
    significantCount: significant.length,
    channels,
  };
}
