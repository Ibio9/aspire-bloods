import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { computeMarkerStatus } from '../../lib/markerStatus.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { storageAdapter } from '../storage/LocalDiskStorageAdapter.js';
import { decryptField } from '../../lib/crypto.js';
import {
  materialiseParsedReport,
  MaterialiseError,
  type MappingFailure,
} from '../reports/materialiseReport.js';
import { holdForReview, recordAutoLink, existingQueueRow } from './autoLink.js';
import { payloadIdentity, verifyOrderIdentity, type PersonIdentity } from './identityCheck.js';
import type {
  ParsedReport,
  ParsedMarkerRow,
  ParsedExclusion,
} from '../result-sources/ResultSourceAdapter.js';
import { nexusLabClient } from './clients/index.js';
import { loadIdMap } from './config.js';
import { assessCodes, recordUnknownCode } from './codes.js';
import { parseRandoxValue, parseReferenceRange, normaliseLabIndicator, labStatusDisagrees } from './clients/parseResult.js';
import { resolveAnalyte } from './analyteMap.js';
import {
  loadLearnedMappings,
  recordAnalyteSightings,
  type AnalyteSighting,
  type SightingOutcome,
} from './analyteObservations.js';
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
 * whose it is. Whether the result reaches the patient is the writer's decision
 * and not this file's: a clean parse is released by materialiseParsedReport and
 * a held one stays at PARSED with its reasons on it. Nothing here may release
 * anything, and nothing here may acknowledge a hold.
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
const MERGEABLE_STATUSES = new Set(['UPLOADED', 'PARSED', 'CHANGES_REQUESTED']);

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
  /**
   * Analytes Randox sent that no catalogue marker claims, with the exact
   * strings they used. This is the working list for filling in
   * analyteMap.ts — a mapping added from a real spelling is worth ten added
   * from a guess at one.
   */
  unmappedAnalytes: {
    analyte: string | null;
    group: string | null;
    displayName: string | null;
    sampleType: string | null;
    reason: string;
  }[];
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
  /** Analytes with no mapping, reported so the map can be filled in from real spellings. */
  const unmappedAnalytes: {
    analyte: string | null;
    group: string | null;
    displayName: string | null;
    sampleType: string | null;
    reason: string;
  }[] = [];
  let pendingCount = 0;
  /** What we saw and how it went, for the mapping-confidence record. */
  const sightings: (AnalyteSighting & { outcome: SightingOutcome })[] = [];

  const markers = await prisma.marker.findMany({ where: { isActive: true }, select: { id: true, key: true, name: true, severityMultiplier: true, severityAbsoluteDelta: true } });
  // Mappings a human accepted from the exception queue. Read per delivery
  // rather than cached — see LearnedAnalyteMappings. Before the first accept
  // this is empty and the map behaves exactly as it did.
  const learned = await loadLearnedMappings();

  for (const raw of detail.reportResults) {
    const name = raw.displayName?.trim() || raw.analyte?.trim() || '(unnamed test)';

    // Randox carry void AND caveat codes in one `caveat` string — there is
    // no separate void field in the spec. So every code goes through the
    // same classifier and the configured map decides which it is; an
    // unrecognised code is void. See codes.ts.
    const caveatCodes = splitCaveatField(raw.caveat);
    // CONFIRMED against real Randox data (dummy order 900002): a void code is
    // delivered IN the `result` field, in place of the value (e.g. "VOIDQ"),
    // with a null caveat. So the result field is classified too, and a code
    // found there voids the row. Without this, "VOIDQ" falls through to
    // parseRandoxValue as qualitative text and renders to the patient.
    const resultAsCode = looksLikeCode(raw.result);
    const assessment = assessCodes({
      voidCodes: resultAsCode ? [resultAsCode] : [],
      caveatCodes,
    });

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

    // WHICH MARKER THIS IS. Exact, then normalised, and nothing beyond — see
    // analyteMap.ts. A row that does not resolve is NOT dropped and is NOT
    // guessed at: it becomes an exclusion carrying the raw analyte, the group
    // and the display name, which is what puts it in front of a human with
    // the exact spelling they need to add one line to the map.
    const resolution = resolveAnalyte(
      {
        analyte: raw.analyte,
        displayName: raw.displayName,
        group: raw.group,
        sampleType: raw.sampleType,
      },
      learned,
    );
    // Recorded whichever way it went. A resolution that WORKED is the evidence
    // the mapping-confidence figure is built from, and it was previously
    // thrown away — only the failures were reported, so the product could say
    // what it could not read and never what it could.
    sightings.push({
      analyte: raw.analyte,
      displayName: raw.displayName,
      group: raw.group,
      sampleType: raw.sampleType,
      orderNumber: detail.orderNumber ?? null,
      outcome:
        resolution.status === 'MAPPED'
          ? { status: 'RESOLVED', markerKey: resolution.markerKey, via: resolution.via }
          : { status: 'UNMAPPED' },
    });
    if (resolution.status !== 'MAPPED') {
      unmappedAnalytes.push({
        analyte: raw.analyte,
        group: raw.group,
        displayName: raw.displayName,
        sampleType: raw.sampleType,
        reason: resolution.reason,
      });
      exclusions.push({
        rawName: name,
        code: null,
        codeRecognised: false,
        // NOT withheld by the laboratory — they reported it and we could not
        // say what it was. materialiseReport holds the report for an admin on
        // the strength of this, which a lab-withheld exclusion does not do.
        kind: 'UNMAPPED_ANALYTE',
        reason:
          `This result could not be filed against a marker in our catalogue. ` +
          `Randox sent analyte "${raw.analyte ?? ''}"` +
          (raw.displayName && raw.displayName !== raw.analyte ? ` (shown as "${raw.displayName}")` : '') +
          (raw.group ? ` in group "${raw.group}"` : '') +
          (raw.sampleType ? `, sample type "${raw.sampleType}"` : '') +
          `. ${resolution.reason}`,
      });
      continue;
    }

    // A disagreement can only be computed where we have both a number and a
    // two-sided range to compute our own status from. The marker is the one
    // the analyte map resolved — not a name-shaped guess at a catalogue key,
    // which is what this used to do and which silently fell back to the
    // default severity multiplier for every marker whose key was not simply
    // its lowercased name with the punctuation taken out.
    let disagrees = false;
    if (value.kind === 'numeric' && value.value !== null && range.low !== null && range.high !== null) {
      const marker = markers.find((m) => m.key === resolution.markerKey);
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
        ? `Result is a limit, not a measurement ("${value.text}"). It has no position on a range bar and is not plotted on a trend.`
        : value.kind === 'qualitative'
          ? `Non-numeric result ("${value.text}").`
          : range.oneSided
            ? `The laboratory supplied only one side of the reference range ("${range.lowRaw ?? ''}" – "${range.highRaw ?? ''}").`
            : disagrees
              ? `The laboratory flagged this result "${raw.lowHigh}", which disagrees with the range they supplied.`
              : null;

    rows.push({
      rawName: name,
      // Decided here, explicitly, so materialiseReport files it rather than
      // matching on the name again with looser rules.
      markerKey: resolution.markerKey,
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

  // WHAT WE HAVE SEEN RANDOX SEND, recorded before this returns. It never
  // throws — see recordAnalyteSightings — because a result that arrived and
  // resolved has to reach the patient's report whether or not we managed to
  // write down that we had seen its spelling before.
  await recordAnalyteSightings(sightings);

  return {
    pendingCount,
    unmappedAnalytes,
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
        biologicalSex: normaliseBiologicalSex(detail.patientBiologicalSex),
      },
    },
  };
}

/**
 * Randox's biological sex, as one of ours — or null.
 *
 * The wire value is a name on some endpoints and a numeric/string id on
 * others (GetBiologicalSex returns `{id: "1", name: "Male"}`), so both shapes
 * are accepted. Anything else is null: this feeds an advisory optimal range
 * and nothing else, and a guessed sex there would silently hand a patient the
 * other cohort's band.
 */
function normaliseBiologicalSex(raw: string | number | null | undefined): 'MALE' | 'FEMALE' | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === 'male' || s === 'm' || s === '1') return 'MALE';
  if (s === 'female' || s === 'f' || s === '2') return 'FEMALE';
  return null;
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
 * Detects a Randox lab code sitting in the `result` field where a value
 * should be. Confirmed against real data: a voided analyte carries its void
 * code (e.g. "VOIDQ") as the entire result string, no flag, null caveat.
 *
 * Narrow by design: an all-caps token with optional trailing digits, and NOT
 * a number, comparator, or ordinary qualitative phrase. "VOIDQ" matches;
 * "162.0", "< 5.0", "Not detected", "Reactive" do not. A match goes to the
 * classifier, which decides known vs unknown; an unknown token where a number
 * belongs voids, because it is not a result.
 */
function looksLikeCode(result: string | null | undefined): string | null {
  if (result === null || result === undefined) return null;
  const text = String(result).trim();
  if (text === '') return null;
  if (Number.isFinite(Number(text))) return null;
  if (/^(<=|>=|<|>|\u2264|\u2265|=<|=>)/.test(text)) return null;
  if (/^[A-Z]{2,}[0-9]*$/.test(text)) return text;
  return null;
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

  // ⚠ THIS BRANCH FIRES FAR MORE OFTEN SINCE AUTOMATIC RELEASE (Aug 2026), and
  // that is correct rather than incidental. A clean delivery is RELEASED by the
  // time a redelivery arrives, where it used to be sitting at PARSED and
  // mergeable — so a second copy of the same order no longer quietly overwrites
  // the results a patient has already read. Amending a released value goes
  // through the versioned path (editReleasedReportResult), which keeps what was
  // there before. A PARTIAL delivery is HELD and therefore still at PARSED, so
  // the merge case that actually matters — the rest of the panel arriving — is
  // untouched.
  //
  // A VOIDED report is NOT a duplicate. Somebody deliberately took it away
  // (usually by unlinking it from the wrong account), so the right answer to a
  // redelivery is the admin queue rather than "nothing to do here" — which is
  // what DUPLICATE means and would silently drop it.
  if (existing && !existing.voidedAt && !MERGEABLE_STATUSES.has(existing.status)) {
    const message = `Redelivery of order ${orderNumber} ignored: the report is already ${existing.status.toLowerCase().replace(/_/g, ' ')}.`;
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

  // ---------------------------------------------------------------------
  // Whose results are these?
  //
  // The answer is the order number, and only the order number. We created
  // this order ourselves through CreatePendingOrder against a known patient
  // record, and Randox have echoed that exact reference back on the result.
  // That is a direct reference, not a match — nothing below compares names to
  // find a patient, and there is no fuzzy, partial or probabilistic path into
  // a patient's record anywhere in this file.
  //
  // Having found the account by reference, the identity is then corroborated
  // before anything is written (identityCheck.ts). Everything that does not
  // corroborate goes to the queue with the reason on it. In normal operation
  // that queue is empty.
  // ---------------------------------------------------------------------
  const order = await prisma.randoxOrder.findUnique({
    where: { orderNumber },
    include: { patient: { include: { patientProfile: true } } },
  });

  const labIdentity = payloadIdentity(detail);

  const { parsed, pendingCount, unmappedAnalytes } = await normaliseResultDetail(detail, {
    patientRef: order?.patientId ?? null,
    // What the LAB said, in preference to what we already believe — a queue
    // row that restates our own record back at the admin is no evidence at
    // all. Falls back to the order's account only when Randox sent nothing.
    claimedName:
      labIdentity.firstName || labIdentity.lastName || labIdentity.dob
        ? labIdentity
        : order?.patient.patientProfile
          ? { firstName: order.patient.patientProfile.firstName, lastName: order.patient.patientProfile.lastName }
          : null,
  });

  const hold = async (
    reason: Parameters<typeof holdForReview>[0]['reason'],
    detailText: string,
  ): Promise<IngestResult> => {
    await holdForReview({
      sourceKey: SOURCE_KEY,
      externalId: orderNumber,
      parsed,
      reason,
      detail: detailText,
      claimed: labIdentity,
    });
    await logAttempt({ orderNumber, outcome: 'UNMATCHED_PATIENT', message: detailText });
    return { outcome: 'UNMATCHED_PATIENT', reportId: null, markersIngested: 0, markersExcluded: 0, message: detailText };
  };

  if (!order || order.patient.role !== 'PATIENT') {
    return hold(
      'NO_MATCHING_ORDER',
      `No local record of Randox order ${orderNumber}, so there is no reference tying it to an account. Held for an admin to link: see Result linking.`,
    );
  }

  // A result a person has already unlinked from a patient. It never re-links
  // itself — reversing an automatic decision has to stay reversed, or the
  // next poll simply undoes the correction.
  const queued = await existingQueueRow(orderNumber);
  if (queued?.autoLinkBlocked) {
    return hold(
      'PREVIOUSLY_UNLINKED',
      `Order ${orderNumber} was unlinked from a patient${queued.unlinkReason ? ` (${queued.unlinkReason})` : ''}, so it is not linked again automatically. An admin decides where it belongs.`,
    );
  }

  const profile = order.patient.patientProfile;
  if (!profile || order.patient.deactivatedAt) {
    return hold(
      'NO_PATIENT_ACCOUNT',
      !profile
        ? `Order ${orderNumber} is against an account with no registration details, so there is nothing to check the result against. The result is held until the account is complete.`
        : `Order ${orderNumber} is against an account that has been deactivated. The result is held rather than attached to it.`,
    );
  }

  // The three statements of identity: what the lab returned, what the order
  // was placed under, and what the account says now.
  const orderSnapshot: PersonIdentity = {
    firstName: order.orderedFirstName,
    lastName: order.orderedLastName,
    dob: order.orderedDobEncrypted ? safeDecrypt(order.orderedDobEncrypted) : null,
  };
  const account: PersonIdentity = {
    firstName: profile.firstName,
    lastName: profile.lastName,
    dob: safeDecrypt(profile.dobEncrypted),
  };

  const identity = verifyOrderIdentity({ lab: labIdentity, orderSnapshot, account });

  if (identity.verdict === 'DISAGREES') {
    return hold(
      'IDENTITY_MISMATCH',
      `Order ${orderNumber} matches an order we placed, but the identity does not agree with the patient on it: ${identity.disagreements.join('; ')}. It has NOT been attached to anyone.`,
    );
  }
  if (identity.verdict === 'UNCORROBORATED') {
    return hold('UNCORROBORATED_IDENTITY', `Order ${orderNumber}: ${identity.summary}`);
  }

  // Every reportable analyte was voided. Randox move the order to status 5
  // themselves in this case. Creating an empty report would put a report in
  // the patient's list with nothing in it.
  // Every reportable analyte was VOIDED BY THE LABORATORY — which is a
  // different thing from every analyte being unmappable by us, and only the
  // first means there is genuinely nothing to report. An all-unmapped delivery
  // falls through to materialiseReport, which refuses it with a sentence
  // naming the real problem.
  const withheldByLab = (parsed.exclusions ?? []).filter((x) => x.kind !== 'UNMAPPED_ANALYTE');
  if (parsed.rows.length === 0 && pendingCount === 0 && withheldByLab.length > 0 && withheldByLab.length === (parsed.exclusions?.length ?? 0)) {
    const excluded = parsed.exclusions!.length;
    const message = `Every result on order ${orderNumber} was withheld by the laboratory, so no report was created. ${excluded} test(s) could not be reported.`;
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

  // The link, and what it was made on. Written after the report exists so a
  // failed materialise can never leave a link recorded against nothing.
  await recordAutoLink({
    sourceKey: SOURCE_KEY,
    externalId: orderNumber,
    parsed,
    patientId: order.patientId,
    reportId: outcome.reportId,
    markerCount: outcome.markerCount,
    identity,
    claimed: labIdentity.dob || labIdentity.lastName ? labIdentity : orderSnapshot,
  });

  // Said out loud, with the exact strings on it. An unmapped analyte is not a
  // fault in the delivery — it is a line missing from analyteMap.ts — and the
  // only thing that makes it fixable is knowing precisely what Randox called
  // it. This is the reason nothing here guesses.
  if (unmappedAnalytes.length > 0) {
    console.warn(
      `[randox] order ${orderNumber}: ${unmappedAnalytes.length} analyte(s) have no mapping to a catalogue marker. ` +
        'They are excluded from the report and listed here so ANALYTE_OVERRIDES can be filled in from the real spelling:\n' +
        unmappedAnalytes
          .map((a) => `  - analyte "${a.analyte ?? ''}" | display "${a.displayName ?? ''}" | group "${a.group ?? ''}" | sampleType "${a.sampleType ?? ''}" — ${a.reason}`)
          .join('\n'),
    );
    await recordAuditLog({
      actorType: 'SYSTEM',
      action: 'RANDOX_ANALYTE_UNMAPPED',
      targetType: 'Report',
      targetId: outcome.reportId,
      metadata: { orderNumber, unmappedAnalytes: unmappedAnalytes as unknown as Prisma.InputJsonValue },
    });
  }

  const isPartial = pendingCount > 0;
  const parts = [`${outcome.markerCount} marker(s) ingested`];
  if (outcome.excludedCount > 0) parts.push(`${outcome.excludedCount} could not be reported`);
  if (pendingCount > 0) parts.push(`${pendingCount} still being processed by the lab`);
  if (outcome.disagreementCount > 0) {
    parts.push(`${outcome.disagreementCount} where Randox’s own high/low flag disagrees with the range they sent`);
  }
  // WHETHER THE PATIENT CAN SEE IT, and if not, why not. A clean parse releases
  // itself; a held one has to say what is being asked, or the "automatic"
  // promise quietly becomes "sometimes automatic, and you find out by noticing".
  //
  // `released` rather than `clean` is deliberate. They differ only when a clean
  // report failed to release, which is exactly the case a log line saying
  // "released to the patient" must not be written about.
  parts.push(
    outcome.clean
      ? outcome.released
        ? 'parse clean, released to the patient'
        : 'parse clean, but the automatic release failed — needs releasing by hand'
      : `HELD: ${outcome.holdReasons.join(' ')}`,
  );
  // No trailing full stop where the last part already ends in one: the hold
  // reasons are whole sentences now (lib/cleanParse.ts), and appending to them
  // produced "…incomplete..".
  const body = parts.join(', ');
  const message = `Order ${orderNumber}: ${body}${body.endsWith('.') ? '' : '.'}`;

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

/**
 * A stored date of birth that cannot be decrypted is not a date of birth.
 * Returning null routes the result to the queue as uncorroborated, which is
 * the right outcome — the alternative is throwing inside a poll sweep and
 * losing the order to a retry loop over a fault no retry can fix.
 */
function safeDecrypt(value: string): string | null {
  try {
    return decryptField(value);
  } catch {
    return null;
  }
}

/** Rows on a payload that the lab has not reported yet. Exported for tests. */
export function countPendingRows(rows: RandoxReportResultRow[]): number {
  return rows.filter((r) => parseRandoxValue(r.result).kind === 'absent').length;
}
