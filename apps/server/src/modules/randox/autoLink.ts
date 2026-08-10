import type { Prisma, UnmatchedReason } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { encryptField } from '../../lib/crypto.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import type { ParsedReport } from '../result-sources/ResultSourceAdapter.js';
import type { IdentityCheck, PersonIdentity } from './identityCheck.js';

/**
 * ---------------------------------------------------------------------------
 * Recording what happened to a result — linked, or held, and on what evidence.
 * ---------------------------------------------------------------------------
 *
 * Both outcomes write to the SAME table, UnmatchedResult, and that is the
 * point of this file. A queue row is not "the failures"; it is the record of
 * every result that arrived and what was decided about it. An automatically
 * linked result gets a row in status LINKED, which never appears in the
 * pending queue and is never work for anybody — but it means:
 *
 *   - there is exactly one place that answers "why is this report on this
 *     account", with the evidence attached, and
 *   - there is exactly one way to undo it (unlinkResult), which already
 *     voids the report, audits the reversal and returns the result to the
 *     queue — with no second code path to keep in step.
 *
 * A wrong automatic link is the worst failure this system has. It has to be
 * traceable and reversible by construction, not by someone remembering to
 * write the undo.
 */

/** The queue row for an external id, if we have one. */
export async function existingQueueRow(externalId: string) {
  return prisma.unmatchedResult.findUnique({ where: { externalId } });
}

export interface HoldInput {
  sourceKey: string;
  externalId: string;
  parsed: ParsedReport;
  reason: UnmatchedReason;
  detail: string;
  /** Identity as the LAB stated it, where we have it. Never as we guessed it. */
  claimed?: PersonIdentity & { contactNumber?: string | null };
}

/**
 * Holds a result for an admin, with the reason it could not be linked.
 *
 * Upsert by externalId so a redelivery refreshes the same row rather than
 * giving the admin two copies of the same order to choose between. A row that
 * has already been linked or dismissed is left alone — a later poll must not
 * silently resurrect a decision somebody has already made.
 */
export async function holdForReview(input: HoldInput): Promise<void> {
  const { sourceKey, externalId, parsed, reason, detail } = input;
  const claimed = input.claimed ?? parsed.claimedPatient ?? null;

  const data = {
    sourceKey,
    claimedFirstName: claimed?.firstName ?? null,
    claimedLastName: claimed?.lastName ?? null,
    claimedDobEncrypted: claimed?.dob ? encryptField(claimed.dob) : null,
    claimedContactNumberEncrypted:
      claimed && 'contactNumber' in claimed && claimed.contactNumber ? encryptField(claimed.contactNumber) : null,
    sampleDate: parsed.sampleDate ? new Date(parsed.sampleDate) : null,
    markerCount: parsed.rows.length,
    payload: parsed as unknown as Prisma.InputJsonValue,
    reason,
    reasonDetail: detail,
  };

  const existing = await prisma.unmatchedResult.findUnique({ where: { externalId } });
  if (existing && existing.status !== 'PENDING') return;

  await prisma.unmatchedResult.upsert({
    where: { externalId },
    // autoLinkBlocked is deliberately absent from the update: a result a
    // human unlinked stays blocked through every subsequent redelivery.
    create: { externalId, ...data },
    update: data,
  });
}

/**
 * Records an automatic link and audits the evidence it was made on.
 *
 * The audit entry carries WHAT agreed, never the values that agreed. An audit
 * log is read by more people than a patient record is, and restating a date of
 * birth into it to prove the date of birth matched would leak the identifier
 * in the course of proving we checked it.
 */
export async function recordAutoLink(input: {
  sourceKey: string;
  externalId: string;
  parsed: ParsedReport;
  patientId: string;
  reportId: string;
  markerCount: number;
  identity: IdentityCheck;
  /** The identity the lab stated, for the queue row's own display. */
  claimed: PersonIdentity;
}): Promise<void> {
  const { sourceKey, externalId, parsed, patientId, reportId, markerCount, identity, claimed } = input;

  const evidence = {
    matchedOn: 'order_reference',
    orderNumber: externalId,
    identityVerdict: identity.verdict,
    ...identity.evidence,
    summary: identity.summary,
  };

  const data = {
    sourceKey,
    claimedFirstName: claimed.firstName,
    claimedLastName: claimed.lastName,
    claimedDobEncrypted: claimed.dob ? encryptField(claimed.dob) : null,
    sampleDate: parsed.sampleDate ? new Date(parsed.sampleDate) : null,
    markerCount,
    payload: parsed as unknown as Prisma.InputJsonValue,
    status: 'LINKED' as const,
    reason: null,
    reasonDetail: null,
    linkedReportId: reportId,
    linkedPatientId: patientId,
    // No person decided this. linkMode is what says so — an absent linkedById
    // on its own would be indistinguishable from a lost record of who.
    linkedById: null,
    linkedAt: new Date(),
    linkMode: 'AUTOMATIC' as const,
    linkEvidence: evidence as unknown as Prisma.InputJsonValue,
  };

  const existing = await prisma.unmatchedResult.findUnique({ where: { externalId } });
  if (existing) {
    await prisma.unmatchedResult.update({ where: { id: existing.id }, data });
  } else {
    await prisma.unmatchedResult.create({ data: { externalId, ...data } });
  }

  await recordAuditLog({
    actorType: 'SYSTEM',
    action: 'RESULT_AUTO_LINKED_TO_PATIENT',
    targetType: 'User',
    targetId: patientId,
    metadata: {
      reportId,
      sourceKey,
      externalId,
      markerCount,
      evidence: evidence as unknown as Prisma.InputJsonValue,
    },
  });
}
