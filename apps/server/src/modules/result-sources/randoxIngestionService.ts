import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { encryptField } from '../../lib/crypto.js';
import { computeMarkerStatus } from '../../lib/markerStatus.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { findBestMarkerMatch } from '../reports/matchMarker.js';
import { RandoxApiAdapter } from './RandoxApiAdapter.js';
import type { ParsedReport } from './ResultSourceAdapter.js';

const adapter = new RandoxApiAdapter();

export interface MappingFailure {
  markerName: string;
  reason: string;
}

export class MaterialiseError extends Error {
  constructor(
    message: string,
    public mappingFailures: MappingFailure[] = [],
  ) {
    super(message);
  }
}

export interface MaterialiseResult {
  reportId: string;
  markerCount: number;
  mappingFailures: MappingFailure[];
}

/**
 * Turns a normalised result set into a real Report against a real patient.
 * Extracted from ingestOne() because it now has two callers with genuinely
 * different front halves and an identical back half: the automated poll,
 * which finds the patient by the reference Randox echoes back, and an admin
 * explicitly linking a result that arrived with nobody attached to it (see
 * modules/admin/linkingService.ts).
 *
 * Both land at exactly the same place — ADMIN_VERIFIED, never past it. A
 * linked result is not a released result; the clinician review and release
 * gate is untouched by either path.
 */
export async function materialiseParsedReport(input: {
  patientId: string;
  sourceKey: string;
  externalId: string | null;
  parsed: ParsedReport;
}): Promise<MaterialiseResult> {
  const { patientId, sourceKey, externalId, parsed } = input;

  const existing = externalId ? await prisma.report.findUnique({ where: { externalId } }) : null;
  const panel = parsed.panelKey ? await prisma.panel.findUnique({ where: { key: parsed.panelKey } }) : null;
  const source = await prisma.source.findUnique({ where: { key: sourceKey } });
  if (!source) {
    throw new MaterialiseError(`${sourceKey} source is not seeded.`);
  }

  const allMarkers = await prisma.marker.findMany({ where: { isActive: true } });
  const patientSex = (await prisma.patientProfile.findUnique({ where: { userId: patientId } }))?.sex ?? 'ANY';

  const mappingFailures: MappingFailure[] = [];
  const matchedRows: { markerId: string; value: number; unit: string; low: number; high: number }[] = [];

  for (const row of parsed.rows) {
    const marker = findBestMarkerMatch(row.rawName, allMarkers);
    if (!marker) {
      mappingFailures.push({ markerName: row.rawName, reason: 'No matching marker in the catalogue' });
      continue;
    }
    if (row.value == null) {
      mappingFailures.push({ markerName: row.rawName, reason: 'Non-numeric result, needs manual entry' });
      continue;
    }
    if (row.referenceLow == null || row.referenceHigh == null) {
      mappingFailures.push({ markerName: row.rawName, reason: 'Missing reference range on the incoming result' });
      continue;
    }
    matchedRows.push({
      markerId: marker.id,
      value: row.value,
      unit: row.unit ?? marker.defaultUnit,
      low: row.referenceLow,
      high: row.referenceHigh,
    });
  }

  if (matchedRows.length === 0) {
    throw new MaterialiseError('None of the markers in this delivery could be mapped to our catalogue.', mappingFailures);
  }

  const reportId = await prisma.$transaction(async (tx) => {
    const report = existing
      ? await tx.report.update({
          where: { id: existing.id },
          data: {
            patientId,
            panelId: panel?.id ?? existing.panelId,
            sampleDate: parsed.sampleDate ? new Date(parsed.sampleDate) : existing.sampleDate,
          },
        })
      : await tx.report.create({
          data: {
            patientId,
            panelId: panel?.id ?? null,
            sourceId: source.id,
            externalId,
            sampleDate: parsed.sampleDate ? new Date(parsed.sampleDate) : new Date(),
            status: 'PARSED',
            // No staff uploader for an automated feed — see uploadedById's
            // schema comment. Attribution lives in the audit log (actorType
            // SYSTEM) and IngestionLogEntry instead.
            uploadedById: null,
          },
        });

    for (const row of matchedRows) {
      const referenceRange = await tx.referenceRange.create({
        data: {
          markerId: row.markerId,
          sex: patientSex,
          unit: row.unit,
          low: row.low,
          high: row.high,
          source: `${sourceKey}, ingested ${new Date().toISOString().slice(0, 10)}${externalId ? ` (order ${externalId})` : ''}`,
        },
      });
      const marker = allMarkers.find((m) => m.id === row.markerId)!;
      await tx.reportResult.upsert({
        where: { reportId_markerId: { reportId: report.id, markerId: row.markerId } },
        create: {
          reportId: report.id,
          markerId: row.markerId,
          valueEncrypted: encryptField(String(row.value)),
          unit: row.unit,
          referenceRangeId: referenceRange.id,
          status: computeMarkerStatus(row.value, row.low, row.high, marker.severityMultiplier, marker.severityAbsoluteDelta),
        },
        update: {
          valueEncrypted: encryptField(String(row.value)),
          unit: row.unit,
          referenceRangeId: referenceRange.id,
          status: computeMarkerStatus(row.value, row.low, row.high, marker.severityMultiplier, marker.severityAbsoluteDelta),
        },
      });
    }

    // Machine-sourced, structured data — there's no OCR ambiguity for an
    // admin to eyeball the way a PDF parse has, so ingestion can safely
    // land the report at ADMIN_VERIFIED (data is in and computed) rather
    // than stopping at PARSED. verifiedById stays null (no staff user
    // verified it) — the audit log entry is the record of what happened and
    // when. Clinician review and release remain untouched, explicit, human
    // actions: automatic ingestion is not automatic publication, and
    // neither is an admin linking a result to an account.
    await tx.report.update({
      where: { id: report.id },
      data: { status: 'ADMIN_VERIFIED', verifiedAt: new Date() },
    });

    return report.id;
  });

  return { reportId, markerCount: matchedRows.length, mappingFailures };
}

/**
 * Statuses a Report can still be safely merged into on a redelivery —
 * anything past this (clinician has reviewed or released it) means a
 * resend is treated as a duplicate rather than silently mutating a report
 * that's already progressed through the release gate.
 */
const MERGEABLE_STATUSES = new Set(['PARSED', 'ADMIN_VERIFIED', 'CHANGES_REQUESTED']);

async function logAttempt(input: {
  externalId: string;
  outcome: 'INGESTED' | 'PARTIAL' | 'DUPLICATE' | 'UNMATCHED_PATIENT' | 'FAILED';
  reportId?: string;
  markerCount?: number;
  message: string;
  mappingFailures?: MappingFailure[];
}) {
  await prisma.ingestionLogEntry.create({
    data: {
      sourceKey: 'randox_api',
      externalId: input.externalId,
      outcome: input.outcome,
      reportId: input.reportId,
      markerCount: input.markerCount ?? 0,
      message: input.message,
      mappingFailures:
        input.mappingFailures && input.mappingFailures.length > 0
          ? (input.mappingFailures as unknown as Prisma.InputJsonValue)
          : undefined,
    },
  });
  await recordAuditLog({
    actorType: 'SYSTEM',
    action: 'RANDOX_RESULT_INGESTED',
    targetType: 'Report',
    targetId: input.reportId,
    metadata: { externalId: input.externalId, outcome: input.outcome, message: input.message },
  });
}

async function ingestOne(externalId: string): Promise<void> {
  const existing = await prisma.report.findUnique({ where: { externalId } });
  if (existing && !MERGEABLE_STATUSES.has(existing.status)) {
    await logAttempt({
      externalId,
      outcome: 'DUPLICATE',
      reportId: existing.id,
      message: `Redelivery of ${externalId} ignored. The report is already ${existing.status.toLowerCase().replace('_', ' ')}.`,
    });
    return;
  }

  let parsed: ParsedReport;
  try {
    const buffer = await adapter.fetchResults(externalId);
    parsed = await adapter.normaliseReport(buffer);
  } catch (e) {
    await logAttempt({
      externalId,
      outcome: 'FAILED',
      message: `Could not fetch/parse result from Randox: ${e instanceof Error ? e.message : 'unknown error'}`,
    });
    return;
  }

  // The practice submits orders to Randox tagged with our own patientId as
  // the client reference, so a result is matched back to an account by
  // that same id being echoed on the response — see RandoxApiAdapter's
  // header comment.
  //
  // Now that patients register themselves, the account and the lab order are
  // created independently, so a missing or unresolvable reference is the
  // ordinary case rather than an anomaly. Rather than logging it and hoping
  // the account turns up on a later poll, the result is parked in the
  // unmatched queue with whatever identity the lab stated, where an admin can
  // see it beside the accounts that have nothing attached and link the two
  // explicitly. Nothing is matched on a name here — that decision is a
  // person's, under the rules in modules/admin/linkingService.ts.
  const patient = parsed.externalPatientRef
    ? await prisma.user.findUnique({ where: { id: parsed.externalPatientRef } })
    : null;
  if (!patient || patient.role !== 'PATIENT') {
    await parkAsUnmatched(externalId, parsed);
    await logAttempt({
      externalId,
      outcome: 'UNMATCHED_PATIENT',
      message: parsed.externalPatientRef
        ? `No patient account found for reference "${parsed.externalPatientRef}". Held for an admin to link; see Result linking.`
        : 'Randox did not supply a patient reference on this result. Held for an admin to link; see Result linking.',
    });
    return;
  }

  let outcome: MaterialiseResult;
  try {
    outcome = await materialiseParsedReport({
      patientId: patient.id,
      sourceKey: 'randox_api',
      externalId,
      parsed,
    });
  } catch (e) {
    if (e instanceof MaterialiseError) {
      await logAttempt({
        externalId,
        outcome: 'FAILED',
        reportId: existing?.id,
        message: e.message,
        mappingFailures: e.mappingFailures,
      });
      return;
    }
    throw e;
  }

  await logAttempt({
    externalId,
    outcome: outcome.mappingFailures.length > 0 || parsed.isPartial ? 'PARTIAL' : 'INGESTED',
    reportId: outcome.reportId,
    markerCount: outcome.markerCount,
    message: parsed.isPartial
      ? `Partial delivery: ${outcome.markerCount} marker(s) ingested, more expected from Randox.`
      : outcome.mappingFailures.length > 0
        ? `${outcome.markerCount} marker(s) ingested, ${outcome.mappingFailures.length} skipped; see mapping failures.`
        : `${outcome.markerCount} marker(s) ingested.`,
    mappingFailures: outcome.mappingFailures,
  });
}

/**
 * Holds a result nobody can be attached to yet. Upsert by externalId so a
 * redelivery refreshes the same queue row instead of giving the admin two
 * copies of the same order to choose between.
 *
 * A row that has already been linked or dismissed is left alone — a later
 * poll must not silently resurrect a decision an admin has already made.
 */
async function parkAsUnmatched(externalId: string, parsed: ParsedReport): Promise<void> {
  const claimed = parsed.claimedPatient ?? null;
  const data = {
    sourceKey: 'randox_api',
    claimedFirstName: claimed?.firstName ?? null,
    claimedLastName: claimed?.lastName ?? null,
    claimedDobEncrypted: claimed?.dob ? encryptField(claimed.dob) : null,
    claimedContactNumberEncrypted: claimed?.contactNumber ? encryptField(claimed.contactNumber) : null,
    sampleDate: parsed.sampleDate ? new Date(parsed.sampleDate) : null,
    markerCount: parsed.rows.length,
    payload: parsed as unknown as Prisma.InputJsonValue,
  };

  const existing = await prisma.unmatchedResult.findUnique({ where: { externalId } });
  if (existing && existing.status !== 'PENDING') return;

  await prisma.unmatchedResult.upsert({
    where: { externalId },
    create: { externalId, ...data },
    update: data,
  });
}

/**
 * Cron entry point (see index.ts) — polls Randox for whatever's pending
 * and ingests each one independently, so one bad result never blocks the
 * rest of the batch. Every attempt is logged via IngestionLogEntry
 * regardless of outcome, so a silently failed import doesn't go unnoticed.
 */
export async function runRandoxIngestionJob(): Promise<void> {
  let pending: string[];
  try {
    pending = await adapter.listPendingResultIds();
  } catch (e) {
    console.error('[randoxIngestion] failed to list pending results:', e);
    await prisma.ingestionLogEntry.create({
      data: {
        sourceKey: 'randox_api',
        outcome: 'FAILED',
        message: `Could not reach Randox to list pending results: ${e instanceof Error ? e.message : 'unknown error'}`,
      },
    });
    return;
  }

  for (const externalId of pending) {
    try {
      await ingestOne(externalId);
    } catch (e) {
      console.error(`[randoxIngestion] unhandled error ingesting ${externalId}:`, e);
      await logAttempt({
        externalId,
        outcome: 'FAILED',
        message: `Unhandled error during ingestion: ${e instanceof Error ? e.message : 'unknown error'}`,
      }).catch(() => {});
    }
  }
}
