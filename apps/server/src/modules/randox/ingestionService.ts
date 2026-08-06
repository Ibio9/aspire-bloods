import type { Prisma, Marker } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { encryptField } from '../../lib/crypto.js';
import { computeMarkerStatus } from '../../lib/markerStatus.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { findBestMarkerMatch } from '../reports/matchMarker.js';
import { storageAdapter } from '../storage/LocalDiskStorageAdapter.js';
import { nexusLabClient } from './clients/index.js';
import { loadIdMap } from './config.js';
import { assessCodes, recordUnknownCode } from './codes.js';
import type { GetOrderResultDetailResponse, RandoxResultItem } from './types.js';

/**
 * Turns a completed Randox order into a Report in the normalised store.
 *
 * Three things this deliberately does NOT do:
 *
 *  1. It does not publish. Ingestion lands a report at ADMIN_VERIFIED and
 *     stops. Clinician review and release stay explicit human actions —
 *     an API result reaching a patient without a clinician releasing it
 *     would be exactly the failure the release gate exists to prevent.
 *  2. It does not write a value for anything carrying a void code. There
 *     is no ReportResult row for a voided marker at all, so no read path
 *     can render one by accident.
 *  3. It does not drop anything silently. Every skipped marker becomes a
 *     mapping failure on the IngestionLogEntry, visible in the admin area.
 *
 * Idempotency is on the Randox Order Number, carried as Report.externalId
 * (unique). A redelivered payload merges into the same report; a report
 * that has already passed the review gate is left alone and logged as a
 * duplicate.
 */

/** Statuses a report can still be merged into on a redelivery. */
const MERGEABLE_STATUSES = new Set(['UPLOADED', 'PARSED', 'ADMIN_VERIFIED', 'CHANGES_REQUESTED']);

const SOURCE_KEY = 'randox_api';

interface MappingFailure {
  markerName: string;
  reason: string;
  code?: string;
}

export type IngestOutcome =
  | 'INGESTED'
  | 'PARTIAL'
  | 'DUPLICATE'
  | 'UNMATCHED_PATIENT'
  | 'FAILED'
  /** Every result on the order was voided — no report is created. */
  | 'ALL_VOIDED';

export interface IngestResult {
  outcome: IngestOutcome;
  reportId: string | null;
  markersIngested: number;
  markersExcluded: number;
  message: string;
}

async function logAttempt(input: {
  orderNumber: string;
  outcome: 'INGESTED' | 'PARTIAL' | 'DUPLICATE' | 'UNMATCHED_PATIENT' | 'FAILED';
  reportId?: string | null;
  markerCount?: number;
  message: string;
  mappingFailures?: MappingFailure[];
}): Promise<void> {
  await prisma.ingestionLogEntry.create({
    data: {
      sourceKey: SOURCE_KEY,
      externalId: input.orderNumber,
      outcome: input.outcome,
      reportId: input.reportId ?? undefined,
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
    targetId: input.reportId ?? undefined,
    metadata: { orderNumber: input.orderNumber, outcome: input.outcome, message: input.message },
  });
}

/**
 * Resolves one Randox marker name to our catalogue: explicit override
 * first (config), then fuzzy name match. Never invents a marker.
 */
function resolveMarker(rawName: string, markers: Marker[]): Marker | null {
  const override = loadIdMap().markerNameOverrides[rawName.trim().toLowerCase()];
  if (override) {
    const byKey = markers.find((m) => m.key === override);
    if (byKey) return byKey;
  }
  return findBestMarkerMatch(rawName, markers);
}

interface AssessedRow {
  raw: RandoxResultItem;
  marker: Marker | null;
  /** Set when the row must not become a ReportResult. */
  exclusion: { code: string | null; codeRecognised: boolean; reason: string } | null;
  caveatCodes: string[];
  /** Still being processed by the lab — not an exclusion, just not here yet. */
  pending: boolean;
}

/**
 * Classifies every row before anything is written. Order-level void and
 * caveat codes are folded into each row, because a code on the order
 * applies to every analyte on it.
 */
async function assessRows(
  detail: GetOrderResultDetailResponse,
  markers: Marker[],
): Promise<{ rows: AssessedRow[]; unrecognisedCodes: Set<string> }> {
  const unrecognised = new Set<string>();
  const rows: AssessedRow[] = [];

  for (const raw of detail.results) {
    const assessment = assessCodes({
      voidCodes: [...detail.voidCodes, ...raw.voidCodes],
      caveatCodes: [...detail.caveatCodes, ...raw.caveatCodes],
    });

    for (const code of assessment.unrecognisedCodes) {
      unrecognised.add(code);
      await recordUnknownCode(code, { orderNumber: detail.orderNumber, markerName: raw.testName });
    }

    const marker = resolveMarker(raw.testName, markers);

    let exclusion: AssessedRow['exclusion'] = null;
    if (assessment.isVoid) {
      const first = assessment.voidCodes[0];
      exclusion = {
        code: first?.code ?? null,
        codeRecognised: first?.recognised ?? false,
        reason: assessment.voidReason ?? 'Voided by the laboratory.',
      };
    } else if (!raw.pending && raw.value === null) {
      // A reportable result with no number. Not void — the lab didn't say
      // it was unreportable — but there's nothing to plot or range-check,
      // so it goes to an admin rather than into the trend store.
      exclusion = {
        code: null,
        codeRecognised: true,
        reason: raw.textValue
          ? `Non-numeric result ("${raw.textValue}") — needs manual entry.`
          : 'No value supplied for this test.',
      };
    } else if (!raw.pending && (raw.referenceLow === null || raw.referenceHigh === null)) {
      // Reference ranges live on the result, not the marker (project rule).
      // Without one from the API there is nothing to store, and inventing a
      // range from the marker catalogue would attach a range the lab never
      // issued to a value the lab did.
      exclusion = {
        code: null,
        codeRecognised: true,
        reason: 'No reference range supplied on the incoming result — cannot be range-checked.',
      };
    }

    rows.push({
      raw,
      marker,
      exclusion,
      caveatCodes: assessment.caveatCodes.map((c) => c.code),
      pending: raw.pending,
    });
  }

  return { rows, unrecognisedCodes: unrecognised };
}

/**
 * Stores the raw payload and the lab PDF. Both are kept: the normalised
 * results are a lossy read of the JSON, and the PDF is the document the
 * lab actually issued.
 *
 * Storage failures are logged and swallowed — losing the archive copy is
 * bad, but discarding a whole set of results because a disk write failed
 * would be worse.
 */
async function storeArtefacts(
  orderNumber: string,
  reportId: string,
  detail: GetOrderResultDetailResponse,
): Promise<{ pdfFileId: string | null; jsonFileId: string | null }> {
  let jsonFileId: string | null = null;
  let pdfFileId: string | null = null;

  try {
    const jsonBuffer = Buffer.from(JSON.stringify(detail, null, 2), 'utf-8');
    const saved = await storageAdapter.save(jsonBuffer, {
      originalFilename: `randox-${orderNumber}.json`,
      mimeType: 'application/json',
    });
    const file = await prisma.storedFile.create({
      data: {
        kind: 'RANDOX_RESULT_JSON',
        storageKey: saved.storageKey,
        originalFilename: `randox-${orderNumber}.json`,
        mimeType: 'application/json',
        sizeBytes: saved.sizeBytes,
        generatedForReportId: reportId,
      },
    });
    jsonFileId = file.id;
  } catch (e) {
    console.error(`[randox] failed to store result JSON for order ${orderNumber}:`, e);
  }

  try {
    const reports = await nexusLabClient().getOrderResultReports(orderNumber);
    const first = reports[0];
    if (first) {
      const buffer = Buffer.from(first.contentBase64, 'base64');
      const saved = await storageAdapter.save(buffer, {
        originalFilename: first.filename,
        mimeType: first.mimeType,
      });
      const file = await prisma.storedFile.create({
        data: {
          kind: 'RANDOX_PDF',
          storageKey: saved.storageKey,
          originalFilename: first.filename,
          mimeType: first.mimeType,
          sizeBytes: saved.sizeBytes,
        },
      });
      pdfFileId = file.id;
    }
  } catch (e) {
    console.error(`[randox] failed to store result PDF for order ${orderNumber}:`, e);
  }

  return { pdfFileId, jsonFileId };
}

/**
 * The single entry point for "this order has results — take them".
 *
 * Called by the polling sweep today. A webhook would call exactly this
 * with the order number from the callback body and need to change nothing
 * else — which is the point: the trigger is replaceable, the ingestion is
 * not.
 */
export async function ingestOrderResults(orderNumber: string): Promise<IngestResult> {
  const existing = await prisma.report.findUnique({ where: { externalId: orderNumber } });

  if (existing && !MERGEABLE_STATUSES.has(existing.status)) {
    const message = `Redelivery of order ${orderNumber} ignored — the report is already ${existing.status.toLowerCase().replace(/_/g, ' ')}.`;
    await logAttempt({ orderNumber, outcome: 'DUPLICATE', reportId: existing.id, message });
    return { outcome: 'DUPLICATE', reportId: existing.id, markersIngested: 0, markersExcluded: 0, message };
  }

  let detail: GetOrderResultDetailResponse;
  try {
    detail = await nexusLabClient().getOrderResultDetail(orderNumber);
  } catch (e) {
    const message = `Could not fetch results for order ${orderNumber}: ${e instanceof Error ? e.message : 'unknown error'}`;
    await logAttempt({ orderNumber, outcome: 'FAILED', message });
    return { outcome: 'FAILED', reportId: null, markersIngested: 0, markersExcluded: 0, message };
  }

  // Patient matching: we submit our own patient id as the external
  // reference and Randox echo it back. A result we can't attribute is
  // logged and left — the next poll picks it up if the account appears.
  // It is never attached to a best-guess patient.
  const patient = detail.externalPatientReference
    ? await prisma.user.findUnique({ where: { id: detail.externalPatientReference } })
    : null;

  if (!patient || patient.role !== 'PATIENT') {
    const message = detail.externalPatientReference
      ? `No patient account matches reference "${detail.externalPatientReference}" on order ${orderNumber}. Nothing was stored; the next poll will retry.`
      : `Randox returned no patient reference on order ${orderNumber}, so it cannot be attributed to an account.`;
    await logAttempt({ orderNumber, outcome: 'UNMATCHED_PATIENT', message });
    return { outcome: 'UNMATCHED_PATIENT', reportId: null, markersIngested: 0, markersExcluded: 0, message };
  }

  const source = await prisma.source.findUnique({ where: { key: SOURCE_KEY } });
  if (!source) {
    const message = `The "${SOURCE_KEY}" source row is missing — run the seed. Order ${orderNumber} was not ingested.`;
    await logAttempt({ orderNumber, outcome: 'FAILED', message });
    return { outcome: 'FAILED', reportId: null, markersIngested: 0, markersExcluded: 0, message };
  }

  const markers = await prisma.marker.findMany({ where: { isActive: true } });
  const { rows } = await assessRows(detail, markers);

  const reportable = rows.filter((r) => !r.exclusion && !r.pending && r.marker && r.raw.value !== null);
  const excluded = rows.filter((r) => r.exclusion);
  const pending = rows.filter((r) => r.pending && !r.exclusion);

  const mappingFailures: MappingFailure[] = [];
  for (const row of rows) {
    if (row.exclusion) {
      mappingFailures.push({
        markerName: row.raw.testName,
        reason: row.exclusion.reason,
        ...(row.exclusion.code ? { code: row.exclusion.code } : {}),
      });
    } else if (!row.pending && !row.marker) {
      mappingFailures.push({
        markerName: row.raw.testName,
        reason: 'No matching marker in our catalogue — add a mapping (RANDOX_ID_MAP_FILE markerNameOverrides) or the marker itself.',
      });
    }
  }

  // Every result on the order was voided. Randox report this as status 5,
  // and there is nothing to put in a report — creating an empty one would
  // put a report in the patient's list with no content in it.
  if (reportable.length === 0 && pending.length === 0 && excluded.length === rows.length && rows.length > 0) {
    const message = `Every result on order ${orderNumber} was voided by the laboratory — no report was created. ${excluded.length} test(s) could not be reported.`;
    await logAttempt({
      orderNumber,
      outcome: 'FAILED',
      message,
      markerCount: 0,
      mappingFailures,
    });
    await prisma.randoxOrder.updateMany({
      where: { orderNumber },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'All results voided by the laboratory.', nextPollAt: null },
    });
    return { outcome: 'ALL_VOIDED', reportId: null, markersIngested: 0, markersExcluded: excluded.length, message };
  }

  // Nothing usable and nothing voided either — an empty or unmappable
  // delivery. Don't create a report; log it so an admin sees it.
  if (reportable.length === 0 && pending.length === 0) {
    const message = `Nothing on order ${orderNumber} could be ingested — ${rows.length} result(s) received, none mapped to our catalogue.`;
    await logAttempt({ orderNumber, outcome: 'FAILED', message, mappingFailures });
    return { outcome: 'FAILED', reportId: null, markersIngested: 0, markersExcluded: excluded.length, message };
  }

  const panelKey = detail.randoxPanelId ? loadIdMap().panelsByRandoxId[detail.randoxPanelId] : undefined;
  const panel = panelKey ? await prisma.panel.findUnique({ where: { key: panelKey } }) : null;
  const patientSex = (await prisma.patientProfile.findUnique({ where: { userId: patient.id } }))?.sex ?? 'ANY';
  const sampleDate = detail.sampleCollectedAt ? new Date(detail.sampleCollectedAt) : new Date();

  const reportId = await prisma.$transaction(async (tx) => {
    const report = existing
      ? await tx.report.update({
          where: { id: existing.id },
          data: { panelId: panel?.id ?? existing.panelId, sampleDate },
        })
      : await tx.report.create({
          data: {
            patientId: patient.id,
            panelId: panel?.id ?? null,
            sourceId: source.id,
            externalId: orderNumber,
            sampleDate,
            status: 'PARSED',
            // No staff uploader on an automated feed; attribution is the
            // SYSTEM audit entry and the IngestionLogEntry.
            uploadedById: null,
          },
        });

    for (const row of reportable) {
      const marker = row.marker!;
      const value = row.raw.value!;
      const unit = row.raw.unit ?? marker.defaultUnit;
      const low = row.raw.referenceLow!;
      const high = row.raw.referenceHigh!;

      // The range Randox issued with THIS result, stored against the
      // result — not looked up from the marker. Project rule: reference
      // ranges live on the result.
      const referenceRange = await tx.referenceRange.create({
        data: {
          markerId: marker.id,
          sex: patientSex,
          unit,
          low,
          high,
          source: `Randox API, order ${orderNumber}, ingested ${new Date().toISOString().slice(0, 10)}`,
        },
      });

      const status = computeMarkerStatus(value, low, high, marker.severityMultiplier, marker.severityAbsoluteDelta);

      await tx.reportResult.upsert({
        where: { reportId_markerId: { reportId: report.id, markerId: marker.id } },
        create: {
          reportId: report.id,
          markerId: marker.id,
          valueEncrypted: encryptField(String(value)),
          unit,
          referenceRangeId: referenceRange.id,
          status,
          caveatCodes: row.caveatCodes,
        },
        update: {
          valueEncrypted: encryptField(String(value)),
          unit,
          referenceRangeId: referenceRange.id,
          status,
          caveatCodes: row.caveatCodes,
        },
      });
    }

    // Exclusions are recorded, not just omitted — a marker that was
    // ordered and could not be reported is information the patient and the
    // clinician both need, even though the value never appears.
    for (const row of excluded) {
      await tx.reportResultExclusion.upsert({
        where: { reportId_rawMarkerName: { reportId: report.id, rawMarkerName: row.raw.testName } },
        create: {
          reportId: report.id,
          markerId: row.marker?.id ?? null,
          rawMarkerName: row.raw.testName,
          code: row.exclusion!.code,
          codeRecognised: row.exclusion!.codeRecognised,
          reason: row.exclusion!.reason,
        },
        update: {
          markerId: row.marker?.id ?? null,
          code: row.exclusion!.code,
          codeRecognised: row.exclusion!.codeRecognised,
          reason: row.exclusion!.reason,
        },
      });

      // A marker that was excluded on a redelivery but had been ingested
      // on an earlier partial one must lose its value. Otherwise a result
      // the lab has since voided would stay visible.
      if (row.marker) {
        await tx.reportResult.deleteMany({ where: { reportId: report.id, markerId: row.marker.id } });
      }
    }

    // Structured, machine-sourced data — there's no OCR ambiguity for an
    // admin to eyeball, so it lands at ADMIN_VERIFIED rather than PARSED.
    // verifiedById stays null: no human verified it, and the audit trail
    // says so. Clinician review and release are untouched.
    await tx.report.update({
      where: { id: report.id },
      data: { status: 'ADMIN_VERIFIED', verifiedAt: new Date() },
    });

    return report.id;
  });

  const { pdfFileId } = await storeArtefacts(orderNumber, reportId, detail);
  if (pdfFileId) {
    // originalPdfFileId is unique — on a redelivery the report may already
    // have one, in which case the newer file stays attached as a generated
    // file rather than replacing history.
    const report = await prisma.report.findUnique({ where: { id: reportId }, select: { originalPdfFileId: true } });
    if (!report?.originalPdfFileId) {
      await prisma.report.update({ where: { id: reportId }, data: { originalPdfFileId: pdfFileId } });
    } else {
      await prisma.storedFile.update({ where: { id: pdfFileId }, data: { generatedForReportId: reportId } });
    }
  }

  await prisma.randoxOrder.updateMany({ where: { orderNumber }, data: { reportId } });

  const isPartial = pending.length > 0;
  const outcome: 'INGESTED' | 'PARTIAL' = isPartial || mappingFailures.length > 0 ? 'PARTIAL' : 'INGESTED';

  const parts = [`${reportable.length} marker(s) ingested`];
  if (excluded.length > 0) parts.push(`${excluded.length} could not be reported`);
  if (pending.length > 0) parts.push(`${pending.length} still being processed by the lab`);
  const message = `Order ${orderNumber}: ${parts.join(', ')}.`;

  await logAttempt({
    orderNumber,
    outcome,
    reportId,
    markerCount: reportable.length,
    message,
    mappingFailures,
  });

  return {
    outcome: isPartial ? 'PARTIAL' : 'INGESTED',
    reportId,
    markersIngested: reportable.length,
    markersExcluded: excluded.length,
    message,
  };
}
