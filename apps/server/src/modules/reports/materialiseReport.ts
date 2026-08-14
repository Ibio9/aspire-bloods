import { prisma } from '../../db/client.js';
import { encryptField } from '../../lib/crypto.js';
import { computeMarkerStatus } from '../../lib/markerStatus.js';
import { findBestMarkerMatch } from './matchMarker.js';
import { assessParseCleanliness, holdFieldsFor } from '../../lib/cleanParse.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { releaseReport } from './service.js';
import type { ParsedReport } from '../result-sources/ResultSourceAdapter.js';

/**
 * Turns a normalised result set into a real Report against a real patient.
 *
 * This is the single writer for machine-sourced results, with two callers
 * whose front halves differ entirely and whose back half is identical:
 *
 *   - the automated Randox poll, which knows the patient because Randox
 *     echo back the reference we sent at order time
 *     (modules/randox/ingestionService.ts), and
 *   - an admin explicitly linking a result that arrived with nobody
 *     attached to it (modules/admin/linkingService.ts).
 *
 * It used to live inside randoxIngestionService.ts. It moved here when the
 * Randox integration was rebuilt against the real API spec: the linking
 * flow has nothing to do with Randox's order lifecycle, and leaving the
 * shared writer inside a vendor-specific module meant the vendor module
 * could not be replaced without breaking a feature that doesn't depend on
 * it. Everything Randox-specific (void codes, order status, polling) is in
 * modules/randox/; everything about *writing a result* is here.
 *
 * Both callers land at exactly the same place, and since Aug 2026 that place is
 * RELEASED when the parse was CLEAN and PARSED with `holdReasons` when it was
 * not. There is no clinician gate any more: a patient not seeing their own
 * abnormal result is worse than them seeing it, and a result sitting in a queue
 * nobody opens is the real risk.
 *
 * THE SPLIT IS THE WHOLE SAFETY PROPERTY, so it is worth being exact about it.
 * `assessParseCleanliness` (lib/cleanParse.ts) is a CLOSED LIST of five facts
 * about the delivery, and anything on it holds the report here rather than
 * releasing it. Automation releases clean work; it never pushes a problem
 * through. Nothing in this file may pass `acknowledgeHolds` — that is a person
 * saying they have read the reasons, and a machine cannot say it about its own
 * question.
 */

export interface MappingFailure {
  markerName: string;
  reason: string;
  /** The lab code responsible, when a code was the reason. */
  code?: string;
}

export class MaterialiseError extends Error {
  constructor(
    message: string,
    public mappingFailures: MappingFailure[] = [],
  ) {
    super(message);
    this.name = 'MaterialiseError';
  }
}

export interface MaterialiseResult {
  reportId: string;
  markerCount: number;
  /** Markers withheld because the lab could not report them. */
  excludedCount: number;
  /** Rows where the lab's own high/low flag disagreed with our computed status. */
  disagreementCount: number;
  mappingFailures: MappingFailure[];
  /**
   * True when the parse was CLEAN — see lib/cleanParse.ts for the closed list of
   * conditions. A clean report is RELEASED to the patient by this call; an
   * unclean one stays at PARSED, in the exception queue, with `holdReasons` on it.
   */
  clean: boolean;
  /** Why it is held, in sentences a clinician reads. Empty when clean. */
  holdReasons: string[];
  /**
   * Whether the patient can see it now. Almost always equal to `clean` — it is
   * false on a clean parse only if the release itself failed, which is recorded
   * rather than thrown, because a report that is written and not released is
   * recoverable and one that is neither is not.
   */
  released: boolean;
}

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
  // A numeric result carries a status and a reference range, and only a
  // MEASURED marker is allowed to. GENETIC / SENSITIVITY / COMPOSITION /
  // QUALITATIVE markers are a different kind of result with no range and no
  // status (CLAUDE.md), so
  // a numeric row must never be filed against one — even if a name happened to
  // collide. The admin verify/manual-entry path can't reach a non-measured
  // marker at all (the UI only offers measured ones); this is the same
  // guarantee for the machine path, which matches against the whole catalogue.
  const measuredMarkers = allMarkers.filter((m) => m.resultType === 'MEASURED');
  const patientSex = (await prisma.patientProfile.findUnique({ where: { userId: patientId } }))?.sex ?? 'ANY';

  const mappingFailures: MappingFailure[] = [];
  const matchedRows: {
    markerId: string;
    value: number;
    unit: string;
    low: number;
    high: number;
    caveatCodes: string[];
    labStatusIndicator: string | null;
    labStatusDisagrees: boolean;
  }[] = [];

  for (const row of parsed.rows) {
    // AN EXPLICIT KEY WINS OUTRIGHT, AND SUPPRESSES THE NAME MATCHER.
    //
    // A source that can identify its own rows says so on the row (`markerKey`)
    // and this loop looks that key up and nothing else. The Randox API path
    // does exactly that, through modules/randox/analyteMap.ts — two passes,
    // exact then normalised, no fuzzy anything — because nobody reviews an
    // automatic ingestion before it is filed. The PDF path sets no key and
    // still goes through findBestMarkerMatch, whose looser passes are
    // appropriate there because an admin confirms every one of them in the
    // verify table.
    //
    // A key that names a marker we do not have is a mapping failure, not a
    // reason to fall back to the name matcher: falling back would quietly
    // reintroduce exactly the guessing the explicit key exists to avoid.
    const marker = row.markerKey
      ? measuredMarkers.find((m) => m.key === row.markerKey) ?? null
      : findBestMarkerMatch(row.rawName, measuredMarkers);
    if (!marker) {
      mappingFailures.push({
        markerName: row.rawName,
        reason: row.markerKey
          ? `The source resolved this to marker key "${row.markerKey}", which is not an active measured marker in the catalogue.`
          : 'No matching marker in the catalogue',
      });
      continue;
    }
    if (row.value == null) {
      // A qualitative result ("Not detected", "< 5.0") is a legitimate
      // result, not a parse failure — it simply has no numeric value to
      // range-check or plot. It's held for manual entry rather than being
      // coerced into a number, which is the one thing that must never
      // happen: "<5.0" is not 5.0 and is not 0.
      mappingFailures.push({
        markerName: row.rawName,
        reason: row.resultText
          ? `Non-numeric result ("${row.resultText}"): needs manual entry.`
          : 'Non-numeric result: needs manual entry.',
      });
      continue;
    }
    if (row.referenceLow == null || row.referenceHigh == null) {
      mappingFailures.push({
        markerName: row.rawName,
        reason:
          row.referenceLowRaw || row.referenceHighRaw
            ? `Reference range "${row.referenceLowRaw ?? ''} – ${row.referenceHighRaw ?? ''}" is one-sided or non-numeric: needs an admin to set the range.`
            : 'Missing reference range on the incoming result',
      });
      continue;
    }
    // The admin path enforces low < high in the verify schema; the machine path
    // has to as well, or an inverted or zero-width range from the feed reaches
    // computeMarkerStatus, whose band arithmetic (high - low) then goes negative
    // and silently mislabels the result. Held for an admin rather than guessed.
    if (row.referenceLow >= row.referenceHigh) {
      mappingFailures.push({
        markerName: row.rawName,
        reason: `Reference range ${row.referenceLow}–${row.referenceHigh} is invalid (low is not below high): needs an admin to set the range.`,
      });
      continue;
    }
    matchedRows.push({
      markerId: marker.id,
      value: row.value,
      unit: row.unit ?? marker.defaultUnit,
      low: row.referenceLow,
      high: row.referenceHigh,
      caveatCodes: row.caveatCodes ?? [],
      labStatusIndicator: row.labStatusIndicator ?? null,
      labStatusDisagrees: row.labStatusDisagrees ?? false,
    });
  }

  const exclusions = parsed.exclusions ?? [];

  // Nothing usable and nothing withheld either — an empty or wholly
  // unmappable delivery. A report with no results is worse than no report:
  // it appears in the patient's list saying nothing.
  if (matchedRows.length === 0 && exclusions.length === 0) {
    throw new MaterialiseError('None of the markers in this delivery could be mapped to our catalogue.', mappingFailures);
  }
  const unmappedExclusions = exclusions.filter((x) => x.kind === 'UNMAPPED_ANALYTE');
  if (matchedRows.length === 0) {
    // Two different sentences, because they are two different problems: one
    // is the laboratory's decision and the other is a gap in our own map.
    throw new MaterialiseError(
      unmappedExclusions.length === exclusions.length
        ? `None of the ${exclusions.length} result(s) in this delivery could be matched to a marker in our catalogue, so no report was created.`
        : `Every result in this delivery was withheld by the laboratory (${exclusions.length} test(s)), so no report was created.`,
      mappingFailures,
    );
  }

  // ---------------------------------------------------------------------
  // IS THIS A CLEAN PARSE?
  //
  // Computed before the write, because it decides what the write records on
  // the report. The five conditions and the sentences they produce are in
  // lib/cleanParse.ts, deliberately in one place: with the admin verification
  // stage gone, a clean parse goes straight to awaiting clinician review, so
  // anything this assessment lets through reaches a clinician who has no way
  // to know something is missing.
  //
  // Nothing here is a failure and nothing is discarded. A held report is a
  // report with a question attached to it.
  // ---------------------------------------------------------------------
  const disagreementCount = matchedRows.filter((r) => r.labStatusDisagrees).length;
  const cleanliness = assessParseCleanliness({
    unmappedAnalytes: unmappedExclusions.map((x) => x.rawName),
    unfiledRows: mappingFailures.map((f) => ({ markerName: f.markerName, reason: f.reason })),
    // An unrecognised code is already treated as VOID and the result withheld
    // (classifyCode in randox/codes.ts — there is no such thing as an
    // unrecognised CAVEAT, because a caveat is only ever produced from a map
    // entry that says so). So it arrives here as an exclusion carrying
    // codeRecognised: false, and it means a test the patient paid for is absent
    // for a reason nobody has read yet. The real code list is still not
    // available from Randox, so this fires on live data rather than in theory.
    //
    // This is the ONE case where a withheld-by-the-lab exclusion holds the
    // report. A RECOGNISED void code does not: that report is complete as far as
    // anyone here can make it, and the exclusion is on the record.
    unrecognisedCodes: exclusions
      .filter((x) => x.code !== null && !x.codeRecognised)
      .map((x) => x.code as string),
    labDisagreementCount: disagreementCount,
    isPartial: parsed.isPartial ?? false,
  });
  const holdReasons = cleanliness.holdReasons;
  const clean = cleanliness.clean;

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
      // THE RECORD OF WHAT THIS DELIVERY PRINTED, in the table that holds only
      // those. Never the catalogue: this is one patient's paper, and a row
      // written here must never be reachable by anything correcting a fallback.
      const referenceRange = await tx.resultReferenceRange.create({
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
      const status = computeMarkerStatus(row.value, row.low, row.high, marker.severityMultiplier, marker.severityAbsoluteDelta);
      const fields = {
        valueEncrypted: encryptField(String(row.value)),
        unit: row.unit,
        referenceRangeId: referenceRange.id,
        status,
        caveatCodes: row.caveatCodes,
        labStatusIndicator: row.labStatusIndicator,
        labStatusDisagrees: row.labStatusDisagrees,
      };
      await tx.reportResult.upsert({
        where: { reportId_markerId: { reportId: report.id, markerId: row.markerId } },
        create: { reportId: report.id, markerId: row.markerId, ...fields },
        update: fields,
      });
    }

    // Withheld markers are recorded, not merely omitted — a test that was
    // ordered and could not be reported is something the patient and the
    // clinician both need to know about, even though no value ever appears.
    for (const exclusion of exclusions) {
      const marker = findBestMarkerMatch(exclusion.rawName, allMarkers);
      const fields = {
        markerId: marker?.id ?? null,
        code: exclusion.code,
        codeRecognised: exclusion.codeRecognised,
        reason: exclusion.reason,
      };
      await tx.reportResultExclusion.upsert({
        where: { reportId_rawMarkerName: { reportId: report.id, rawMarkerName: exclusion.rawName } },
        create: { reportId: report.id, rawMarkerName: exclusion.rawName, ...fields },
        update: fields,
      });

      // A marker withheld on this delivery but ingested on an earlier
      // partial one must lose its value. Otherwise a result the lab has
      // since voided would stay visible to the patient.
      if (marker) {
        await tx.reportResult.deleteMany({ where: { reportId: report.id, markerId: marker.id } });
      }
    }

    if (parsed.measurements) {
      const m = parsed.measurements;
      const data = {
        heightCm: m.heightCm ?? null,
        weightKg: m.weightKg ?? null,
        waistCm: m.waistCm ?? null,
        hipCm: m.hipCm ?? null,
        pulseBpm: m.pulseBpm ?? null,
        systolicBp: m.systolicBp ?? null,
        diastolicBp: m.diastolicBp ?? null,
        isDiabetic: m.isDiabetic ?? null,
        isSmoker: m.isSmoker ?? null,
        knownVascularDisease: m.knownVascularDisease ?? null,
        onMedicationForHypertension: m.onMedicationForHypertension ?? null,
        ethnicity: m.ethnicity ?? null,
        biologicalSex: m.biologicalSex ?? null,
      };
      await tx.reportMeasurements.upsert({
        where: { reportId: report.id },
        create: { reportId: report.id, ...data },
        update: data,
      });
    }

    // PARSED, WITH THE HOLDS ON IT. The release is a separate step, outside this
    // transaction and deliberately so — see below.
    //
    // verifiedById stays null — no staff user verified this, and stamping one
    // would put a name against a decision nobody made. The audit log entry is the
    // record of what happened and when.
    await tx.report.update({
      where: { id: report.id },
      data: { status: 'PARSED', ...holdFieldsFor(cleanliness) },
    });

    return report.id;
  });

  /**
   * ── AND A CLEAN PARSE RELEASES ITSELF (Aug 2026) ─────────────────────────
   *
   * OUTSIDE THE TRANSACTION, and the reason is escalation. `releaseReport` sends
   * the clinic's email before it writes RELEASED, which is a network call to a
   * third party; holding a database transaction open across it would put the
   * mail provider's latency on a row lock over a patient's results.
   *
   * The two failure modes that produces are not symmetrical, which is why this
   * order is the right one. Written-but-not-released is a report sitting at
   * PARSED with nothing held, which the work queue shows as NOT_RELEASED and a
   * person can release in one press. Released-but-not-written cannot happen at
   * all, because the write has already committed.
   *
   * A THROW HERE IS SWALLOWED, for the same reason. The delivery has been
   * ingested; turning a failed release into a failed ingestion would make the
   * poller retry the whole delivery and lose the record of what arrived.
   */
  let released = false;
  if (clean) {
    try {
      // No actor and no acknowledgement. SYSTEM in the audit log, and a machine
      // may not acknowledge its own holds — which is moot here, since this only
      // runs when there are none.
      await releaseReport(reportId, null, null);
      released = true;
    } catch (releaseError) {
      console.error('[materialise] the report was written but could not be released', {
        reportId,
        error: releaseError instanceof Error ? releaseError.message : releaseError,
      });
      await recordAuditLog({
        actorType: 'SYSTEM',
        action: 'REPORT_AUTO_RELEASE_FAILED',
        targetType: 'Report',
        targetId: reportId,
        metadata: { error: releaseError instanceof Error ? releaseError.message : String(releaseError) },
      });
    }
  }

  return {
    reportId,
    markerCount: matchedRows.length,
    excludedCount: exclusions.length,
    disagreementCount,
    mappingFailures,
    clean,
    holdReasons,
    released,
  };
}

/*
 * parkAsUnmatched() used to live here. It moved to
 * modules/randox/autoLink.ts as holdForReview(), because a result held for
 * an admin now has to carry WHY it was held — and the reasons are all
 * facts about the link decision (no matching order, identity mismatch, no
 * account yet, previously unlinked), which is that file's subject and not
 * this one's. This file writes reports; it has no opinion about whose they
 * are.
 */
