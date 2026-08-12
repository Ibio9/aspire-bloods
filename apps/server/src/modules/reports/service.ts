import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/client.js';
import { encryptField, decryptField } from '../../lib/crypto.js';
import { decodeResultValue } from '../../lib/resultValue.js';
import { computeMarkerStatus } from '../../lib/markerStatus.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { sourceLabel } from '../../lib/sourceLabel.js';
import { storageAdapter } from '../storage/LocalDiskStorageAdapter.js';
import { resultSourceAdapter } from '../result-sources/index.js';
import { findBestMarkerMatch } from './matchMarker.js';
import { canPerform } from '../../lib/reportTransitions.js';
import { holdFieldsFor } from '../../lib/cleanParse.js';
import {
  resolveReferenceRange,
  ageFromDob,
  RANGE_UNAVAILABLE_MESSAGE,
  PROVENANCE_LABEL,
  type RangeProvenance,
} from '../../lib/resolveReferenceRange.js';
import { CATALOGUE_RANGE_ORDER } from '../../lib/catalogueRanges.js';
import {
  classifyValue,
  resolveResultRange,
  deriveStatus,
  statusForStorage,
  disagreesWithLabIndicator,
  type ClassifiedValue,
} from '../../lib/deriveResultStatus.js';
import type { MarkerStatus, PublishReportRequest, VerifyReportRequest } from '@aspire-bloods/shared';
import { formatReportTitle } from '@aspire-bloods/shared';

export class ReportError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function uploadReport(input: {
  patientId: string;
  panelId?: string | null;
  sourceId: string;
  sampleDate: string;
  fileBuffer: Buffer;
  originalFilename: string;
  mimeType: string;
  uploadedById: string;
  ip: string | null;
}) {
  const patient = await prisma.user.findUnique({ where: { id: input.patientId } });
  if (!patient || patient.role !== 'PATIENT') {
    throw new ReportError('Patient not found', 404);
  }
  if (input.panelId) {
    const panel = await prisma.panel.findUnique({ where: { id: input.panelId } });
    if (!panel) {
      throw new ReportError('Panel not found', 404);
    }
  }
  const source = await prisma.source.findUnique({ where: { id: input.sourceId } });
  if (!source || !source.isActive) {
    throw new ReportError('Source not found', 404);
  }

  const { storageKey, sizeBytes } = await storageAdapter.save(input.fileBuffer, {
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
  });

  const file = await prisma.storedFile.create({
    data: {
      kind: 'RANDOX_PDF',
      storageKey,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes,
    },
  });

  const report = await prisma.report.create({
    data: {
      patientId: input.patientId,
      panelId: input.panelId ?? null,
      sourceId: input.sourceId,
      sampleDate: new Date(input.sampleDate),
      status: 'UPLOADED',
      uploadedById: input.uploadedById,
      originalPdfFileId: file.id,
    },
  });

  await recordAuditLog({
    actorUserId: input.uploadedById,
    action: 'REPORT_UPLOADED',
    targetType: 'Report',
    targetId: report.id,
    ipAddress: input.ip,
    metadata: { sourceKey: source.key },
  });

  // Parse straight away rather than making the admin ask for it. Extraction is
  // the slow, entirely mechanical part of publishing a report and there is no
  // decision in it — waiting for a human to press a button before starting it
  // only ever cost an interaction.
  //
  // A parse failure is not an upload failure. The PDF is stored, the report
  // exists at UPLOADED, and the admin can parse it explicitly (or void it) —
  // losing an uploaded file because an extraction call timed out would be a
  // far worse outcome than an extra click.
  let parse: Awaited<ReturnType<typeof parseReport>> | null = null;
  let parseError: string | null = null;
  try {
    parse = await parseReport(report.id, input.uploadedById, input.ip);
  } catch (e) {
    parseError = e instanceof Error ? e.message : 'Extraction failed';
    console.error('[reports] auto-parse after upload failed', { reportId: report.id, error: parseError });
  }

  // Re-read rather than returning the row we created: parseReport moves the
  // report to PARSED, and handing back the pre-parse copy would tell the
  // client UPLOADED for a report that is no longer in that state.
  const current = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
  return { report: current, parse, parseError };
}

/**
 * Extraction flags that mean "a human should look at this row before it goes
 * anywhere". Deliberately a subset: the flags left out are ones the parse can
 * now answer for itself.
 *
 * `non_numeric_result`, `comparator_result` and `one_sided_reference_range`
 * used to force a row into the admin's attention. They no longer do, because
 * a censored value is now placed against the range where that can be done
 * with certainty (lib/deriveResultStatus.ts) and a one-sided range now falls
 * through to the marker's stored fallback. What's left here is the set of
 * things no rule can settle: the extractor read something implausible, or read
 * it two different ways.
 */
const ATTENTION_FLAGS = new Set([
  'implausible_unit',
  'value_order_of_magnitude',
  'two_pass_disagreement',
  'duplicate_printing_disagreement',
]);

const FLAG_ATTENTION_REASON: Record<string, string> = {
  implausible_unit: 'The unit read from the report is not one this marker is usually reported in.',
  value_order_of_magnitude: 'The value sits an order of magnitude away from the reference range, which usually means a misread decimal point.',
  two_pass_disagreement: 'A second read of the report disagreed with the first on this row.',
  duplicate_printing_disagreement: 'This marker is printed more than once on the report with different values.',
};

export type ParseAttentionKind = 'unmatched_marker' | 'no_usable_range' | 'lab_status_disagreement' | 'extraction_flag';

export interface ParseSummary {
  /** Every row the extractor produced. */
  total: number;
  /** Rows matched to a marker, with a usable range, and nothing needing a human. */
  clean: number;
  /** Rows an admin has to look at before this can be published. */
  needingAttention: number;
  /** Rows whose marker name matched nothing in the catalogue. */
  unmatched: number;
  /** Rows whose status could not be derived (qualitative or straddling limit). Recorded as reported; not blocking. */
  unevaluable: number;
  /**
   * True when every row is clean. The one thing the publish confirmation
   * needs to know: can this go out as parsed, or does it need a look first.
   */
  readyToPublish: boolean;
}

export async function parseReport(reportId: string, actorUserId: string, ip: string | null) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      originalPdfFile: true,
      panel: { include: { markers: { include: { marker: true } } } },
      patient: { include: { patientProfile: true } },
    },
  });
  if (!report || !report.originalPdfFile) throw new ReportError('Report not found', 404);
  if (report.voidedAt) throw new ReportError('This report has been voided and cannot be progressed', 409);
  if (!canPerform('parse', report.status)) {
    throw new ReportError(`Cannot parse a report in status ${report.status}`, 409);
  }

  const buffer = await storageAdapter.read(report.originalPdfFile.storageKey);
  const parsed = await resultSourceAdapter.normaliseReport(buffer);

  // No panel is legitimate (ad-hoc report) — matching then falls straight
  // through to the full marker catalogue rather than narrowing first.
  const panelMarkers = report.panel?.markers.map((pm) => pm.marker) ?? [];
  // referenceRanges come along because they are the SECOND source of truth for
  // a range, used only where the lab printed none on the result itself. They
  // are catalogue rows only — a marker has no relation to the per-result
  // records — and they arrive in the resolver's own order, so the suggestion
  // does not depend on what Postgres returned first.
  const allMarkers = await prisma.marker.findMany({
    include: { referenceRanges: { orderBy: CATALOGUE_RANGE_ORDER } },
  });

  const patientSex = report.patient.patientProfile?.sex ?? null;
  const patientAge = report.patient.patientProfile?.dobEncrypted
    ? ageFromDob(decryptField(report.patient.patientProfile.dobEncrypted))
    : null;

  // findBestMarkerMatch's fuzzy fallback is substring-based, so a shorter
  // marker name can match rows that actually belong to a longer, more
  // specific one (e.g. "Total Cholesterol" is a substring of "Total
  // Cholesterol / HDL Cholesterol Ratio"). Two rows can never legitimately
  // both be the correct result for the same marker on one report — the
  // DB's (reportId, markerId) uniqueness enforces that at save time — so
  // once a marker is claimed here, later rows fall back to unmatched
  // rather than silently colliding on the same marker.
  const claimedMarkerIds = new Set<string>();

  const rows = parsed.rows.map((row) => {
    // Narrow to the panel's own markers first where there is a panel at all;
    // an ad-hoc report has none, so matching falls straight through to the
    // full catalogue rather than searching an empty list.
    let match =
      (panelMarkers.length > 0
        ? findBestMarkerMatch(
            row.rawName,
            allMarkers.filter((m) => panelMarkers.some((pm) => pm.id === m.id)),
          )
        : null) ?? findBestMarkerMatch(row.rawName, allMarkers);
    if (match && claimedMarkerIds.has(match.id)) {
      match = null;
    }
    if (match) claimedMarkerIds.add(match.id);

    const classified: ClassifiedValue = classifyValue(row.value, row.resultText);

    // --- Which range applies. Result first, marker fallback second, nothing third.
    let fallback: { low: number; high: number; unit: string } | null = null;
    let fallbackUnavailableReason: string | null = null;
    // What kind of authority is behind the suggestion, so the verify form can
    // show it beside the number rather than presenting every fallback as
    // equally settled — see PROVENANCE_LABEL in lib/resolveReferenceRange.ts.
    let fallbackProvenance: RangeProvenance | null = null;
    if (match) {
      const resolved = resolveReferenceRange(match.referenceRanges, patientSex, patientAge);
      if (resolved.status === 'resolved') {
        fallback = { low: resolved.range.low, high: resolved.range.high, unit: resolved.range.unit };
        fallbackProvenance = resolved.range.provenance ?? 'UNSOURCED';
      } else {
        fallbackUnavailableReason = RANGE_UNAVAILABLE_MESSAGE[resolved.reason];
      }
    }
    const range = resolveResultRange(
      { low: row.referenceLow, high: row.referenceHigh, unit: row.unit ?? null },
      fallback,
      fallbackUnavailableReason,
    );

    // --- Status, derived from whichever range won.
    const derived =
      range.status === 'resolved' && match
        ? deriveStatus(classified, range.low, range.high, match)
        : null;

    const labDisagrees =
      derived?.status === 'derived' && disagreesWithLabIndicator(row.labStatusIndicator, derived.value);

    // --- What, if anything, a human has to deal with.
    const attention: { kind: ParseAttentionKind; message: string }[] = [];
    if (!match) {
      attention.push({
        kind: 'unmatched_marker',
        message: `“${row.rawName}” doesn’t match any marker in the catalogue. Pick the right one, or leave it unmatched to skip this row.`,
      });
    }
    if (range.status === 'missing') {
      attention.push({ kind: 'no_usable_range', message: range.reason });
    }
    if (labDisagrees) {
      attention.push({
        kind: 'lab_status_disagreement',
        message: `The lab flagged this result “${row.labStatusIndicator}”, which disagrees with the status derived from the range on the result. That usually means the range read here isn’t the range the lab applied.`,
      });
    }
    for (const flag of row.flags ?? []) {
      if (ATTENTION_FLAGS.has(flag)) {
        attention.push({ kind: 'extraction_flag', message: FLAG_ATTENTION_REASON[flag] ?? flag });
      }
    }

    return {
      rawLine: row.rawLine,
      rawName: row.rawName,
      matchedMarkerId: match?.id ?? null,
      matchedMarkerName: match?.name ?? null,
      value: row.value,
      // The verbatim lab text for a non-numeric result, carried through so it
      // is saved as reported rather than coerced into a number.
      resultText: row.resultText,
      unit: row.unit ?? (range.status === 'resolved' ? range.unit : null) ?? match?.defaultUnit ?? null,
      referenceLow: range.status === 'resolved' ? range.low : null,
      referenceHigh: range.status === 'resolved' ? range.high : null,
      /** Which of the two sources the range above came from. Null when there is none. */
      rangeSource: range.status === 'resolved' ? range.source : null,
      /**
       * How well-founded the CATALOGUE fallback is, on the row that offers it.
       * Null when the range came off the result itself, because a range printed
       * on the paper needs no provenance from us — it IS the provenance.
       */
      rangeProvenance: range.status === 'resolved' && range.source === 'marker_fallback' ? fallbackProvenance : null,
      rangeProvenanceLabel:
        range.status === 'resolved' && range.source === 'marker_fallback' && fallbackProvenance
          ? PROVENANCE_LABEL[fallbackProvenance].label
          : null,
      rangeProvenanceDetail:
        range.status === 'resolved' && range.source === 'marker_fallback' && fallbackProvenance
          ? PROVENANCE_LABEL[fallbackProvenance].detail
          : null,
      rangeNotice: range.status === 'missing' ? range.reason : null,
      sampleType: row.sampleType ?? null,
      /** Derived here so the admin never types a status in. Null when no range could be resolved. */
      derivedStatus: derived?.status === 'derived' ? derived.value : null,
      /** Set when the value has no position on the range — a real answer, not a failure. */
      unevaluableReason: derived?.status === 'unevaluable' ? derived.reason : null,
      labStatusIndicator: row.labStatusIndicator ?? null,
      labStatusDisagrees: !!labDisagrees,
      needsReview: row.needsReview,
      reviewReason: row.reviewReason,
      sourceText: row.sourceText ?? row.rawLine,
      confidence: row.confidence ?? null,
      flags: row.flags ?? [],
      attention,
    };
  });

  const unmatched = rows.filter((r) => !r.matchedMarkerId).length;
  const needingAttention = rows.filter((r) => r.attention.length > 0).length;
  const summary: ParseSummary = {
    total: rows.length,
    clean: rows.length - needingAttention,
    needingAttention,
    unmatched,
    unevaluable: rows.filter((r) => r.unevaluableReason !== null).length,
    readyToPublish: rows.length > 0 && needingAttention === 0,
  };

  if (report.status === 'UPLOADED') {
    await prisma.report.update({ where: { id: reportId }, data: { status: 'PARSED' } });
  }

  await recordAuditLog({
    actorUserId,
    action: 'REPORT_PARSED',
    targetType: 'Report',
    targetId: reportId,
    ipAddress: ip,
    metadata: {
      rowCount: rows.length,
      extractionMethod: parsed.extractionMethod,
      needingAttention,
      unmatched,
      // Voided markers never become rows — recorded here so the count an
      // admin sees on screen is reconcilable against the audit trail.
      excluded: parsed.exclusions?.length ?? 0,
    },
  });

  return {
    sampleDate: parsed.sampleDate ?? report.sampleDate.toISOString().slice(0, 10),
    panelName: parsed.panelName ?? null,
    extractionMethod: parsed.extractionMethod,
    fallbackReason: parsed.fallbackReason ?? null,
    summary,
    rows,
  };
}

export async function verifyReport(
  reportId: string,
  input: VerifyReportRequest,
  actorUserId: string,
  ip: string | null,
) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { patient: { include: { patientProfile: true } }, source: true },
  });
  if (!report) throw new ReportError('Report not found', 404);
  if (report.voidedAt) throw new ReportError('This report has been voided and cannot be progressed', 409);
  if (!canPerform('verify', report.status)) {
    throw new ReportError(`Cannot verify a report in status ${report.status}`, 409);
  }
  if (input.results.length === 0) {
    throw new ReportError('At least one result is required', 400);
  }
  const markerIds = input.results.map((r) => r.markerId);
  const markers = await prisma.marker.findMany({ where: { id: { in: markerIds } } });
  const markerById = new Map(markers.map((m) => [m.id, m]));

  // Name the offending marker(s) rather than saying "a marker": on a 40-row
  // verify table, "Total Cholesterol is matched to more than one row" is
  // something an admin can act on at a glance, where the generic sentence sent
  // them hunting through the whole table for the pair.
  const duplicateIds = [...new Set(markerIds.filter((id, i) => markerIds.indexOf(id) !== i))];
  if (duplicateIds.length > 0) {
    const names = duplicateIds.map((id) => markerById.get(id)?.name ?? 'an unrecognised marker');
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    throw new ReportError(
      `${list} ${names.length === 1 ? 'is' : 'are'} matched to more than one row. A report can only hold one result per marker, so unmatch or fix the duplicate${names.length === 1 ? '' : 's'}.`,
      400,
    );
  }
  const patientSex = report.patient.patientProfile?.sex ?? 'ANY';

  // Rows are computed up front and written with two createMany calls (ids
  // generated here so results can reference their ranges without a round
  // trip in between). The previous shape — two creates per marker inside one
  // interactive transaction — was ~85 sequential round trips for a 40-marker
  // report, which a managed database on the other side of a network can push
  // past Prisma's 5s interactive-transaction default (P2028) on an ordinary
  // bad-latency day. Same rows, same statuses, a handful of round trips.
  const verifiedAt = new Date();
  const rangeRows: {
    id: string;
    markerId: string;
    sex: typeof patientSex;
    unit: string;
    low: number;
    high: number;
    source: string;
  }[] = [];
  const resultRows: {
    reportId: string;
    markerId: string;
    valueEncrypted: string;
    unit: string;
    referenceRangeId: string;
    /** Null where the value has no position on the range. Never IN_RANGE by default — see statusForStorage. */
    status: MarkerStatus | null;
  }[] = [];

  for (const row of input.results) {
    const marker = markerById.get(row.markerId);
    if (!marker) throw new ReportError(`Unknown marker ${row.markerId}`, 400);

    // Phase 2 §2.3: the range is sourced from THIS report/source, never
    // assumed from the marker's fallback — recorded per verification,
    // every time, even on re-verify after changes are requested.
    const rangeId = randomUUID();
    rangeRows.push({
      id: rangeId,
      markerId: marker.id,
      sex: patientSex,
      unit: row.unit,
      low: row.referenceLow,
      high: row.referenceHigh,
      source: `${report.source.name}, verified ${verifiedAt.toISOString().slice(0, 10)} (report ${reportId})`,
    });

    // A textual result ("< 0.6", "Not detected") arrives through the same
    // field as a number. Where it CAN be placed against the range with
    // certainty — "< 5.0" against a 0–5.0 range is unambiguously in range —
    // it is. Where it can't, the result is stored with NO status.
    //
    // It used to be stored as IN_RANGE, on the reasoning that "not flagged"
    // and "in range" amount to the same thing. They do not. The portal draws
    // IN_RANGE as the word "In range", a level mark and a green wash, so a
    // qualitative row — and, worse, a row with nothing in it at all — arrived
    // in front of the patient as a marker that had been measured and was fine.
    // See statusForStorage: absence is stored as absence.
    const classified: ClassifiedValue =
      typeof row.value === 'number' ? { kind: 'numeric', value: row.value } : classifyValue(null, row.value);

    // And a row with no value whatever never becomes a result at all. The
    // schema already holds this position for markers the lab voided — see
    // ReportResultExclusion, "a voided value must have no row anywhere a
    // patient read path could reach it" — and a row an admin left empty, or
    // that the lab printed as "—" or "Not performed", is the same fact. Named
    // rather than silently dropped: the admin has to either enter the value or
    // unmatch the row, and either way it is their decision and not ours.
    if (classified.kind === 'absent') {
      throw new ReportError(
        `${marker.name} has no result value. Enter the value from the report, or unmatch the row. A marker with nothing measured is not recorded as in range.`,
        400,
      );
    }

    const derived = deriveStatus(classified, row.referenceLow, row.referenceHigh, marker);

    resultRows.push({
      reportId,
      markerId: marker.id,
      valueEncrypted: encryptField(String(row.value)),
      unit: row.unit,
      referenceRangeId: rangeId,
      status: statusForStorage(derived),
    });
  }

  await prisma.$transaction([
    prisma.reportResult.deleteMany({ where: { reportId } }),
    // A PER-RESULT RECORD, into the table that holds only those. It is not a
    // catalogue row and never was — writing them into the same table as the
    // catalogue is what let a seeder overwrite one. The rows this replaces are
    // left standing rather than deleted: an orphaned record is still the record
    // of what was printed for the result that existed then.
    prisma.resultReferenceRange.createMany({ data: rangeRows }),
    prisma.reportResult.createMany({ data: resultRows }),
    // PARSED, NOT A STAGE OF ITS OWN (changed Aug 2026).
    //
    // This form used to be the gate: it wrote ADMIN_VERIFIED, and `review` was
    // only permitted from there. It is now a CORRECTION — a clinician fixing a
    // value, or keying in a report that never came through the API — so it lands
    // back where the report already was. Correcting the data does not move a
    // report closer to a patient; only the clinician's review does.
    //
    // verifiedById/verifiedAt are still stamped, because somebody did enter this
    // data by hand and the record of who is worth keeping. They are no longer a
    // gate having been passed.
    //
    // AND THE HOLDS ARE CLEARED, because a human has just entered every row
    // deliberately: whatever the machine could not file, they have now filed. A
    // hold that survived the correction that fixed it would put the report in the
    // exception queue for ever.
    prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'PARSED',
        sampleDate: new Date(input.sampleDate),
        verifiedById: actorUserId,
        verifiedAt,
        ...holdFieldsFor({ clean: true, conditions: [], holdReasons: [] }),
      },
    }),
  ]);

  await recordAuditLog({
    actorUserId,
    action: 'REPORT_VERIFIED',
    targetType: 'Report',
    targetId: reportId,
    ipAddress: ip,
    metadata: { resultCount: input.results.length },
  });
}

/**
 * THE ONE HUMAN GATE.
 *
 * A clinician deciding a patient can see this. Not a check that the numbers
 * copied across correctly — there is nothing being copied any more — which is
 * why the admin verification stage that used to sit in front of this is gone.
 *
 * A HELD REPORT MAY BE REVIEWED, BUT NOT BY ACCIDENT. Where the parse was not
 * clean (lib/cleanParse.ts), going ahead requires `acknowledgeHolds`, and that
 * acknowledgement is stamped on the report and named in the audit entry. This is
 * not a second gate: it is part of this one action, and it is what makes
 * "automation never moves a problem forward" true without a second human step.
 * The alternative — letting a held report be approved by the same click as a
 * clean one — is precisely the failure of removing the earlier stage, since the
 * clinician would have no way to know a result was missing.
 */
export async function reviewReport(
  reportId: string,
  approve: boolean,
  note: string | undefined,
  actorUserId: string,
  ip: string | null,
  acknowledgeHolds = false,
) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new ReportError('Report not found', 404);
  if (report.voidedAt) throw new ReportError('This report has been voided and cannot be progressed', 409);
  if (!canPerform('review', report.status)) {
    throw new ReportError(`Cannot review a report in status ${report.status}`, 409);
  }

  const held = report.holdReasons.length > 0;
  // Sending it BACK needs no acknowledgement — requesting changes is the
  // correct response to a hold, and demanding a tick box before somebody is
  // allowed to say "this is not right" would be the check working backwards.
  if (approve && held && !acknowledgeHolds) {
    throw new ReportError(
      `This report is held for review and cannot be approved until the reasons are acknowledged: ` +
        report.holdReasons.join(' '),
      409,
    );
  }

  const now = new Date();
  await prisma.report.update({
    where: { id: reportId },
    data: approve
      ? {
          status: 'CLINICIAN_REVIEWED',
          reviewedById: actorUserId,
          reviewedAt: now,
          ...(held ? { holdsAcknowledgedAt: now, holdsAcknowledgedById: actorUserId } : {}),
        }
      : { status: 'CHANGES_REQUESTED' },
  });

  await recordAuditLog({
    actorUserId,
    action: approve ? 'REPORT_REVIEWED_APPROVED' : 'REPORT_CHANGES_REQUESTED',
    targetType: 'Report',
    targetId: reportId,
    ipAddress: ip,
    // The audit entry records what was actually decided. "Approved" over a held
    // report and "approved" over a clean one are two different decisions, and
    // the holds themselves are written down rather than referenced, because the
    // report's own holdReasons will be cleared by the next correction.
    metadata: {
      ...(note ? { note } : {}),
      ...(held ? { acknowledgedHolds: report.holdReasons } : {}),
    },
  });
}

export async function releaseReport(reportId: string, actorUserId: string, ip: string | null) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new ReportError('Report not found', 404);
  if (report.voidedAt) throw new ReportError('This report has been voided and cannot be progressed', 409);
  if (!canPerform('release', report.status)) {
    throw new ReportError(`Cannot release a report in status ${report.status}`, 409);
  }

  await prisma.report.update({
    where: { id: reportId },
    data: { status: 'RELEASED', releasedAt: new Date() },
  });

  await recordAuditLog({
    actorUserId,
    action: 'REPORT_RELEASED',
    targetType: 'Report',
    targetId: reportId,
    ipAddress: ip,
  });

  return prisma.report.findUniqueOrThrow({ where: { id: reportId } });
}

/**
 * Publish — one admin action, the whole pipeline.
 *
 * The interaction cost of releasing a routine report was the problem: upload,
 * parse, scroll a forty-row table correcting statuses by hand, save, approve,
 * release. This collapses the last four into one click and a confirmation.
 *
 * What it deliberately does NOT do is collapse the state machine. Each
 * transition still runs through its own function above, which means each one
 * still checks canPerform() against reportTransitions.ts, still writes its own
 * audit entry, and still refuses from a status it isn't allowed to run from.
 * Nothing here writes RELEASED directly, nothing skips CLINICIAN_REVIEWED, and a
 * report that fails halfway is left in whatever legitimate intermediate state it
 * reached rather than being forced onward. Since `verify` no longer advances a
 * status, what this collapses is three actions rather than four — and the one it
 * cannot collapse is the review, because that is the gate.
 *
 * So the pipeline is unchanged and the saving is entirely in interactions —
 * which is the only place the saving was ever wanted.
 */
export async function publishReport(
  reportId: string,
  input: PublishReportRequest,
  actorUserId: string,
  ip: string | null,
) {
  // THE HOLDS ARE READ BEFORE VERIFY RUNS, AND THAT ORDER IS THE POINT.
  //
  // `verify` clears them, legitimately — a person has just entered every row
  // deliberately, so whatever the machine could not file, they have now filed. But
  // that means by the time `reviewReport` looks, there is nothing left to
  // acknowledge, and this path would have approved a held report without the
  // acknowledgement the two-step path demands. Not a bypass anybody chose: a
  // bypass produced by the order of three calls.
  //
  // So the holds are captured first, refused on here rather than three calls
  // later, and passed through to the review so the acknowledgement lands on the
  // report and in the audit entry exactly as it would have.
  const before = await prisma.report.findUnique({ where: { id: reportId }, select: { holdReasons: true } });
  if (!before) throw new ReportError('Report not found', 404);
  const heldReasons = before.holdReasons;
  if (heldReasons.length > 0 && !input.acknowledgeHolds) {
    throw new ReportError(
      `This report is held for review and cannot be published until the reasons are acknowledged: ` +
        heldReasons.join(' '),
      409,
    );
  }

  await verifyReport(reportId, { sampleDate: input.sampleDate, results: input.results }, actorUserId, ip);
  await reviewReport(reportId, true, input.note, actorUserId, ip, input.acknowledgeHolds ?? false);
  const report = await releaseReport(reportId, actorUserId, ip);

  // One extra entry on top of the three each transition already wrote, so the
  // audit trail records that these three happened as a single deliberate
  // action rather than reading as three separate decisions taken minutes apart.
  await recordAuditLog({
    actorUserId,
    action: 'REPORT_PUBLISHED',
    targetType: 'Report',
    targetId: reportId,
    ipAddress: ip,
    metadata: {
      resultCount: input.results.length,
      viaSingleStepPublish: true,
      // Written here as well as on the review entry, because verify has cleared
      // the report's own holdReasons by now and this is the record of what the
      // clinician was told when they published.
      ...(heldReasons.length > 0 ? { acknowledgedHolds: heldReasons } : {}),
    },
  });

  return report;
}

/**
 * Void — a state change, not a deletion. The report row, every ReportResult,
 * and the full audit trail all stay exactly as they were; voidedAt is what
 * every patient-facing query filters on to make it disappear from the
 * patient's view, while admin queries keep showing it (marked voided).
 * Allowed from any non-voided status — a report can be voided even before
 * release (e.g. uploaded against the wrong patient entirely).
 */
export async function voidReport(reportId: string, reason: string, actorUserId: string, ip: string | null) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new ReportError('Report not found', 404);
  if (report.voidedAt) {
    throw new ReportError('This report is already voided', 409);
  }

  await prisma.report.update({
    where: { id: reportId },
    data: { voidedAt: new Date(), voidedById: actorUserId, voidReason: reason },
  });

  await recordAuditLog({
    actorUserId,
    action: 'REPORT_VOIDED',
    targetType: 'Report',
    targetId: reportId,
    ipAddress: ip,
    metadata: { reason, statusAtVoid: report.status },
  });
}

/**
 * Editing a value on an already-RELEASED report versions, never overwrites.
 * The ReportResult itself still holds only the current value (so every
 * other read path doesn't need to know about history) but the prior value,
 * who changed it, when, and why are preserved in ReportResultEdit — a
 * clinical record that silently changes is worse than no record at all.
 * The pre-release path (verifyReport, re-verify) is deliberately separate
 * and still overwrites — nothing has been shown to the patient yet there.
 */
export async function editReleasedReportResult(
  resultId: string,
  newValue: number,
  newUnit: string,
  reason: string,
  actorUserId: string,
  ip: string | null,
) {
  if (!reason.trim()) {
    throw new ReportError('A reason is required to edit a released result', 400);
  }

  const result = await prisma.reportResult.findUnique({
    where: { id: resultId },
    include: { report: true, marker: true, referenceRange: true },
  });
  if (!result) throw new ReportError('Result not found', 404);
  if (result.report.status !== 'RELEASED') {
    throw new ReportError('Can only amend a value on a released report. Use verify for anything not yet released.', 409);
  }
  if (result.report.voidedAt) {
    throw new ReportError('Cannot amend a value on a voided report', 409);
  }

  const newStatus = computeMarkerStatus(
    newValue,
    result.referenceRange.low,
    result.referenceRange.high,
    result.marker.severityMultiplier,
    result.marker.severityAbsoluteDelta,
  );
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.reportResultEdit.create({
      data: {
        reportResultId: result.id,
        previousValueEncrypted: result.valueEncrypted,
        previousUnit: result.unit,
        previousStatus: result.status,
        newValueEncrypted: encryptField(String(newValue)),
        newUnit,
        newStatus,
        reason,
        changedById: actorUserId,
        changedAt: now,
      },
    });

    await tx.reportResult.update({
      where: { id: result.id },
      data: {
        valueEncrypted: encryptField(String(newValue)),
        unit: newUnit,
        status: newStatus,
        amendedAt: now,
      },
    });
  });

  await recordAuditLog({
    actorUserId,
    action: 'REPORT_RESULT_AMENDED',
    targetType: 'ReportResult',
    targetId: result.id,
    ipAddress: ip,
    metadata: {
      reportId: result.reportId,
      markerId: result.markerId,
      previousValue: decryptField(result.valueEncrypted),
      previousUnit: result.unit,
      newValue,
      newUnit,
      reason,
    },
  });
}

export async function getReportDetail(reportId: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      panel: true,
      source: true,
      patient: { include: { patientProfile: true } },
      voidedBy: { include: { staffProfile: true } },
      results: {
        include: {
          marker: true,
          referenceRange: true,
          edits: { include: { changedBy: { include: { staffProfile: true } } }, orderBy: { changedAt: 'desc' } },
        },
      },
      originalPdfFile: true,
      // Markers the lab could not report. Staff see the code and the
      // reason; the patient-facing surface gets only a neutral note (see
      // portalService.listDocumentsForPatient).
      exclusions: { include: { marker: true } },
    },
  });
  if (!report) throw new ReportError('Report not found', 404);

  return {
    ...report,
    sourceLabel: sourceLabel(report.source.key, report.source.name),
    title: formatReportTitle(report.panel?.name, report.results.length, report.sampleDate),
    exclusions: report.exclusions.map((x) => ({
      id: x.id,
      markerName: x.marker?.name ?? x.rawMarkerName,
      rawMarkerName: x.rawMarkerName,
      code: x.code,
      // An unrecognised code is shown as unrecognised rather than dressed
      // up as a known reason — it's the signal the code map needs updating.
      codeRecognised: x.codeRecognised,
      reason: x.reason,
    })),
    results: report.results.map((r) => ({
      ...r,
      ...decodeResultValue(decryptField(r.valueEncrypted)),
      edits: r.edits.map((e) => ({
        id: e.id,
        previousValue: Number(decryptField(e.previousValueEncrypted)),
        previousUnit: e.previousUnit,
        previousStatus: e.previousStatus,
        newValue: Number(decryptField(e.newValueEncrypted)),
        newUnit: e.newUnit,
        newStatus: e.newStatus,
        reason: e.reason,
        changedByName: e.changedBy.staffProfile
          ? `${e.changedBy.staffProfile.firstName} ${e.changedBy.staffProfile.lastName}`
          : e.changedBy.email,
        changedAt: e.changedAt,
      })),
    })),
  };
}

export async function listReportsForAdmin() {
  const reports = await prisma.report.findMany({
    include: {
      panel: true,
      source: true,
      patient: { include: { patientProfile: true } },
      results: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return reports.map((r) => ({
    ...r,
    title: formatReportTitle(r.panel?.name, r.results.length, r.sampleDate),
  }));
}
