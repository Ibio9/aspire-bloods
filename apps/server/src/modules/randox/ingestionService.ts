import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { computeMarkerStatus } from '../../lib/markerStatus.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { storageAdapter } from '../storage/LocalDiskStorageAdapter.js';
import {
  materialiseParsedReport,
  parkAsUnmatched,
  MaterialiseError,
  type MappingFailure,
} from '../reports/materialiseReport.js';
import type {
  ParsedReport,
  ParsedMarkerRow,
  ParsedExclusion,
} from '../result-sources/ResultSourceAdapter.js';
import { nexusLabClient } from './clients/index.js';
import { loadIdMap } from './config.js';
import { assessCodes, recordUnknownCode } from './codes.js';
import { parseRandoxValue, parseReferenceRange, normaliseLabIndicator, labStatusDisagrees } from './clients/parseResult.js';
import { mappedKeyFor } from './referenceDataService.js';
import type { GetOrderResultDetailResponse, RandoxReportResultRow, OrderRef } from './types.js';

/**
 * Turns a completed Randox order into a Report.
 *
 * The division of labour here matters: this file knows about Randox — the
 * result payload shape, void and caveat codes, the string-typed value
 * fields, the two identifiers. It knows nothing about how a Report is
 * written. That is modules/reports/materialiseReport.ts, which is shared
 * with the admin result-linking flow and has no idea Randox exists.
 *
 * So this file's job is exactly: fetch → normalise into a ParsedReport →
 * hand it to the shared writer, or park it for an admin if we cannot say
 * whose it is. Ingestion never publishes; the writer lands everything at
 * ADMIN_VERIFIED and the clinician release gate is untouched.
 */

const SOURCE_KEY = 'randox_api';

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

/** Statuses a report can still be merged into on a redelivery. */
const MERGEABLE_STATUSES = new Set(['UPLOADED', 'PARSED', 'ADMIN_VERIFIED', 'CHANGES_REQUESTED']);

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

// ---------------------------------------------------------------------------
// Normalisation: Randox's payload → the shared ParsedReport shape
// ---------------------------------------------------------------------------

interface NormalisedPayload {
  parsed: ParsedReport;
  /** Rows the lab is still processing. Not failures — just not here yet. */
  pendingCount: number;
}

/**
 * Builds a ParsedReport from a GetOrderResultDetail response.
 *
 * Exported for the mock-driven tests, which exercise the payload→rows
 * translation directly rather than through the database.
 */
export async function normaliseResultDetail(
  detail: GetOrderResultDetailResponse,
  options: { patientRef?: string | null; claimedName?: { firstName?: string | null; lastName?: string | null; dob?: string | null } | null } = {},
): Promise<NormalisedPayload> {
  const rows: ParsedMarkerRow[] = [];
  const exclusions: ParsedExclusion[] = [];
  let pendingCount = 0;

  const markers = await prisma.marker.findMany({ where: { isActive: true }, select: { id: true, key: true, name: true, severityMultiplier: true, severityAbsoluteDelta: true } });

  for (const raw of detail.reportResults) {
    const name = raw.displayName?.trim() || raw.analyte?.trim() || '(unnamed test)';

    // Randox carry void AND caveat codes in one `caveat` string — there is
    // no separate void field in the spec. So every code goes through the
    // same classifier and the configured map decides which it is; an
    // unrecognised code is void. See codes.ts.
    const codes = splitCaveatField(raw.caveat);
    const assessment = assessCodes({ voidCodes: [], caveatCodes: codes });

    for (const code of assessment.unrecognisedCodes) {
      await recordUnknownCode(code, { orderNumber: detail.orderNumber, markerName: name });
    }

    if (assessment.isVoid) {
      const first = assessment.voidCodes[0];
      exclusions.push({
        rawName: name,
        code: first?.code ?? null,
        codeRecognised: first?.recognised ?? false,
        reason: assessment.voidReason ?? 'Withheld by the laboratory.',
      });
      continue;
    }

    // The three string fields. None of these is coerced — see parseResult.ts.
    const value = parseRandoxValue(raw.result);
    const range = parseReferenceRange(raw.refLow, raw.refHigh);

    if (value.kind === 'absent') {
      // No result text at all: the lab has the analyte on the order but
      // hasn't reported it. That's a pending analyte, not a void one.
      pendingCount += 1;
      continue;
    }

    const indicator = normaliseLabIndicator(raw.lowHigh);

    // A disagreement can only be computed where we have both a number and a
    // two-sided range to compute our own status from.
    let disagrees = false;
    if (value.kind === 'numeric' && value.value !== null && range.low !== null && range.high !== null) {
      const marker = markers.find((m) => m.key.toLowerCase() === name.toLowerCase().replace(/[^a-z0-9]/gi, ''));
      const ourStatus = computeMarkerStatus(
        value.value,
        range.low,
        range.high,
        marker?.severityMultiplier ?? 1.5,
        marker?.severityAbsoluteDelta ?? null,
      );
      disagrees = labStatusDisagrees(indicator, ourStatus);
    }

    const reviewReason =
      value.kind === 'comparator'
        ? `Result is a limit, not a measurement ("${value.text}") — it has no position on a range bar and is not plotted on a trend.`
        : value.kind === 'qualitative'
          ? `Non-numeric result ("${value.text}").`
          : range.oneSided
            ? `The laboratory supplied only one side of the reference range ("${range.lowRaw ?? ''}" – "${range.highRaw ?? ''}").`
            : disagrees
              ? `The laboratory flagged this result "${raw.lowHigh}", which disagrees with the range they supplied.`
              : null;

    rows.push({
      rawName: name,
      // Non-null ONLY for a plain number. "< 5.0" never becomes 5.0.
      value: value.kind === 'numeric' ? value.value : null,
      unit: raw.units,
      referenceLow: range.low,
      referenceHigh: range.high,
      rawLine: [name, raw.result, raw.units].filter(Boolean).join(' '),
      resultText: value.kind === 'numeric' ? null : value.text,
      needsReview: reviewReason !== null,
      reviewReason,
      sourceText: JSON.stringify(raw),
      // Structured API data carries no extraction uncertainty of its own.
      confidence: null,
      flags: [
        ...(value.kind === 'comparator' ? ['comparator_result'] : []),
        ...(value.kind === 'qualitative' ? ['non_numeric_result'] : []),
        ...(range.oneSided ? ['one_sided_reference_range'] : []),
        ...(disagrees ? ['lab_status_disagreement'] : []),
      ],
      caveatCodes: assessment.caveatCodes.map((c) => c.code),
      labStatusIndicator: raw.lowHigh,
      labStatusDisagrees: disagrees,
      group: raw.group,
      displayName: raw.displayName,
      sampleType: raw.sampleType,
      referenceLowRaw: range.lowRaw,
      referenceHighRaw: range.highRaw,
    });
  }

  const panelKey = await resolvePanelKey(detail);

  return {
    pendingCount,
    parsed: {
      // Documented UTC on the payload. dateOfReceipt/dateOfReport on the
      // rows are Europe/London and are already converted by the client.
      sampleDate: detail.sampleCollectionDate ?? detail.orderCreatedDate ?? null,
      panelName: null,
      panelKey,
      rows,
      exclusions,
      extractionMethod: 'api',
      externalPatientRef: options.patientRef ?? null,
      claimedPatient: options.claimedName ?? null,
      isPartial: pendingCount > 0,
      measurements: {
        heightCm: detail.patientHeight,
        weightKg: detail.patientWeight,
        waistCm: detail.patientWaist,
        hipCm: detail.patientHip,
        pulseBpm: detail.patientPulse,
        systolicBp: detail.patientSystolicBloodPressure,
        diastolicBp: detail.patientDiastolicBloodPressure,
        isDiabetic: detail.patientIsDiabetic,
        isSmoker: detail.patientIsSmoker,
        knownVascularDisease: detail.patientKnownVascularDisease,
        onMedicationForHypertension: detail.patientOnMedicationforHypertension,
        ethnicity: detail.patientEthnicity,
      },
    },
  };
}

/**
 * Randox's `caveat` is one string. It has no documented delimiter, so it is
 * split on the separators labs conventionally use and each fragment is
 * classified independently. A single unsplittable string classifies as one
 * code — which, if we don't recognise it, voids the result. That is the
 * intended direction of failure.
 */
function splitCaveatField(caveat: string | null): string[] {
  if (!caveat || caveat.trim() === '') return [];
  return caveat
    .split(/[,;|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Our Panel.key for the order's panel. The result payload doesn't carry a
 * panel id, so this comes from what we recorded at order time, resolved
 * through the admin's catalogue mapping.
 */
async function resolvePanelKey(detail: GetOrderResultDetailResponse): Promise<string | null> {
  const order = await prisma.randoxOrder.findUnique({ where: { orderNumber: detail.orderNumber } });
  const firstPanelId = order?.randoxPanelIds[0];
  if (!firstPanelId) return null;

  const mapped = await mappedKeyFor('PANEL', firstPanelId);
  if (mapped) return mapped;

  // Fall back to the static id map for a deployment that hasn't run a
  // reference-data refresh yet.
  return loadIdMap().panelsByRandoxId[firstPanelId] ?? null;
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

/**
 * The single entry point for "this order has results — take them".
 *
 * Called by the polling sweep today. A webhook would call exactly this with
 * the order number from the callback body and need to change nothing else.
 */
export async function ingestOrderResults(ref: OrderRef): Promise<IngestResult> {
  const { orderNumber } = ref;
  const existing = await prisma.report.findUnique({ where: { externalId: orderNumber } });

  if (existing && !MERGEABLE_STATUSES.has(existing.status)) {
    const message = `Redelivery of order ${orderNumber} ignored — the report is already ${existing.status.toLowerCase().replace(/_/g, ' ')}.`;
    await logAttempt({ orderNumber, outcome: 'DUPLICATE', reportId: existing.id, message });
    return { outcome: 'DUPLICATE', reportId: existing.id, markersIngested: 0, markersExcluded: 0, message };
  }

  let detail: GetOrderResultDetailResponse;
  try {
    detail = await nexusLabClient().getOrderResultDetail(ref);
  } catch (e) {
    const message = `Could not fetch results for order ${orderNumber}: ${e instanceof Error ? e.message : 'unknown error'}`;
    await logAttempt({ orderNumber, outcome: 'FAILED', message });
    return { outcome: 'FAILED', reportId: null, markersIngested: 0, markersExcluded: 0, message };
  }

  // Which patient this belongs to comes from OUR order record, not from the
  // payload: CreatePendingOrder has no field for a client-side patient
  // reference, so Randox have nothing of ours to echo back. The order row we
  // wrote when we placed it is the only link, which is why placeOrder()
  // persists it in the same breath as the call returning.
  const order = await prisma.randoxOrder.findUnique({
    where: { orderNumber },
    include: { patient: { include: { patientProfile: true } } },
  });

  const { parsed, pendingCount } = await normaliseResultDetail(detail, {
    patientRef: order?.patientId ?? null,
    claimedName: order?.patient.patientProfile
      ? { firstName: order.patient.patientProfile.firstName, lastName: order.patient.patientProfile.lastName }
      : null,
  });

  if (!order || order.patient.role !== 'PATIENT') {
    // No local order record for a result Randox are returning. This is the
    // case the unmatched queue exists for: park it with whatever identity we
    // have and let an admin link it explicitly. Nothing is matched on a name
    // here — see modules/admin/linkingService.ts.
    await parkAsUnmatched(SOURCE_KEY, orderNumber, parsed);
    const message = `No local record of Randox order ${orderNumber}, so it cannot be attributed to an account automatically. Held for an admin to link — see Result linking.`;
    await logAttempt({ orderNumber, outcome: 'UNMATCHED_PATIENT', message });
    return { outcome: 'UNMATCHED_PATIENT', reportId: null, markersIngested: 0, markersExcluded: 0, message };
  }

  // Every reportable analyte was voided. Randox move the order to status 5
  // themselves in this case. Creating an empty report would put a report in
  // the patient's list with nothing in it.
  if (parsed.rows.length === 0 && pendingCount === 0 && (parsed.exclusions?.length ?? 0) > 0) {
    const excluded = parsed.exclusions!.length;
    const message = `Every result on order ${orderNumber} was withheld by the laboratory — no report was created. ${excluded} test(s) could not be reported.`;
    await logAttempt({
      orderNumber,
      outcome: 'FAILED',
      message,
      mappingFailures: parsed.exclusions!.map((x) => ({
        markerName: x.rawName,
        reason: x.reason,
        ...(x.code ? { code: x.code } : {}),
      })),
    });
    await prisma.randoxOrder.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: 'All results voided by the laboratory.',
        nextPollAt: null,
      },
    });
    return { outcome: 'ALL_VOIDED', reportId: null, markersIngested: 0, markersExcluded: excluded, message };
  }

  let outcome;
  try {
    outcome = await materialiseParsedReport({
      patientId: order.patientId,
      sourceKey: SOURCE_KEY,
      externalId: orderNumber,
      parsed,
    });
  } catch (e) {
    if (e instanceof MaterialiseError) {
      await logAttempt({
        orderNumber,
        outcome: 'FAILED',
        reportId: existing?.id,
        message: e.message,
        mappingFailures: e.mappingFailures,
      });
      return { outcome: 'FAILED', reportId: existing?.id ?? null, markersIngested: 0, markersExcluded: 0, message: e.message };
    }
    throw e;
  }

  await storeArtefacts(ref, outcome.reportId, detail);
  await prisma.randoxOrder.update({ where: { id: order.id }, data: { reportId: outcome.reportId } });

  const isPartial = pendingCount > 0;
  const parts = [`${outcome.markerCount} marker(s) ingested`];
  if (outcome.excludedCount > 0) parts.push(`${outcome.excludedCount} could not be reported`);
  if (pendingCount > 0) parts.push(`${pendingCount} still being processed by the lab`);
  if (outcome.disagreementCount > 0) {
    parts.push(`${outcome.disagreementCount} where Randox's own high/low flag disagrees with the range they sent`);
  }
  const message = `Order ${orderNumber}: ${parts.join(', ')}.`;

  await logAttempt({
    orderNumber,
    outcome: isPartial || outcome.mappingFailures.length > 0 || outcome.disagreementCount > 0 ? 'PARTIAL' : 'INGESTED',
    reportId: outcome.reportId,
    markerCount: outcome.markerCount,
    message,
    mappingFailures: outcome.mappingFailures,
  });

  return {
    outcome: isPartial ? 'PARTIAL' : 'INGESTED',
    reportId: outcome.reportId,
    markersIngested: outcome.markerCount,
    markersExcluded: outcome.excludedCount,
    message,
  };
}

/**
 * Stores the raw payload and the lab PDF. Both are kept: the normalised
 * ReportResult rows are a lossy read of the JSON (voided analytes, unmapped
 * markers and qualitative results all leave no row), and the PDF is the
 * document the laboratory actually issued.
 *
 * Failures here are logged and swallowed — losing the archive copy is bad,
 * but discarding a whole set of results because a disk write failed is
 * worse.
 */
async function storeArtefacts(ref: OrderRef, reportId: string, detail: GetOrderResultDetailResponse): Promise<void> {
  try {
    const buffer = Buffer.from(JSON.stringify(detail, null, 2), 'utf-8');
    const saved = await storageAdapter.save(buffer, {
      originalFilename: `randox-${ref.orderNumber}.json`,
      mimeType: 'application/json',
    });
    await prisma.storedFile.create({
      data: {
        kind: 'RANDOX_RESULT_JSON',
        storageKey: saved.storageKey,
        originalFilename: `randox-${ref.orderNumber}.json`,
        mimeType: 'application/json',
        sizeBytes: saved.sizeBytes,
        generatedForReportId: reportId,
      },
    });
  } catch (e) {
    console.error(`[randox] failed to store result JSON for order ${ref.orderNumber}:`, e);
  }

  try {
    const base64 = await nexusLabClient().getOrderResultReports(ref);
    if (!base64) return;

    const filename = `randox-${ref.orderNumber}.pdf`;
    const buffer = Buffer.from(base64, 'base64');
    const saved = await storageAdapter.save(buffer, { originalFilename: filename, mimeType: 'application/pdf' });
    const file = await prisma.storedFile.create({
      data: {
        kind: 'RANDOX_PDF',
        storageKey: saved.storageKey,
        originalFilename: filename,
        mimeType: 'application/pdf',
        sizeBytes: saved.sizeBytes,
      },
    });

    // originalPdfFileId is unique — on a redelivery the report may already
    // have one, in which case the newer file attaches as a generated file
    // rather than replacing what the patient may already have downloaded.
    const report = await prisma.report.findUnique({ where: { id: reportId }, select: { originalPdfFileId: true } });
    if (!report?.originalPdfFileId) {
      await prisma.report.update({ where: { id: reportId }, data: { originalPdfFileId: file.id } });
    } else {
      await prisma.storedFile.update({ where: { id: file.id }, data: { generatedForReportId: reportId } });
    }
  } catch (e) {
    console.error(`[randox] failed to store result PDF for order ${ref.orderNumber}:`, e);
  }
}

/** Rows on a payload that the lab has not reported yet. Exported for tests. */
export function countPendingRows(rows: RandoxReportResultRow[]): number {
  return rows.filter((r) => parseRandoxValue(r.result).kind === 'absent').length;
}
