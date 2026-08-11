import { prisma } from '../../db/client.js';
import { encryptField } from '../../lib/crypto.js';
import { computeMarkerStatus } from '../../lib/markerStatus.js';
import { findBestMarkerMatch } from './matchMarker.js';
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
 * Both callers land at exactly the same place — ADMIN_VERIFIED, never past
 * it. A linked result is not a released result, and neither is an ingested
 * one; the clinician review and release gate is untouched by either path.
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
   * True when the delivery was clean enough to advance to ADMIN_VERIFIED on
   * its own. False means it stopped at PARSED and an admin has something to
   * look at — see holdReasons.
   */
  verified: boolean;
  /** Why it stopped, in words. Empty when verified. */
  holdReasons: string[];
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
  // May this advance on its own, or does it need an admin?
  //
  // Computed before the write, because it decides what status the write
  // lands on. Clean means: every row in the delivery became a result, every
  // one had a usable two-sided range, the lab's own high/low flag agreed
  // with the status we computed for every one of them, and the lab has
  // finished — nothing is still being processed.
  //
  // Anything else is not a failure and is not discarded; it is a report an
  // admin has to look at before a clinician is asked to review it.
  // ---------------------------------------------------------------------
  const disagreementCount = matchedRows.filter((r) => r.labStatusDisagrees).length;
  const holdReasons: string[] = [];
  // AN ANALYTE WE COULD NOT IDENTIFY HOLDS THE REPORT. It is recorded as an
  // exclusion so nothing is lost, but a report that advanced on its own with a
  // result silently missing from it would put a clinician in front of an
  // incomplete panel with nothing saying so. Withheld-by-the-lab exclusions do
  // NOT hold it: that report is complete as far as anyone here can make it.
  if (unmappedExclusions.length > 0) {
    holdReasons.push(
      `${unmappedExclusions.length} result(s) could not be matched to a marker in our catalogue (${[...new Set(unmappedExclusions.map((x) => x.rawName))].slice(0, 5).join(', ')}${unmappedExclusions.length > 5 ? ', …' : ''})`,
    );
  }
  if (mappingFailures.length > 0) {
    holdReasons.push(
      `${mappingFailures.length} result(s) could not be filed automatically (${[...new Set(mappingFailures.map((f) => f.markerName))].slice(0, 5).join(', ')}${mappingFailures.length > 5 ? ', …' : ''})`,
    );
  }
  if (disagreementCount > 0) {
    holdReasons.push(
      `${disagreementCount} result(s) where the laboratory’s own high/low flag disagrees with the reference range they sent`,
    );
  }
  if (parsed.isPartial) {
    holdReasons.push('the laboratory has not finished reporting this order');
  }
  const verified = holdReasons.length === 0;

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

    // Machine-sourced, structured data — there's no OCR ambiguity for an
    // admin to eyeball the way a PDF parse has, so a CLEAN delivery advances
    // to ADMIN_VERIFIED (data is in and computed) rather than stopping at
    // PARSED. verifiedById stays null (no staff user verified it) — the
    // audit log entry is the record of what happened and when.
    //
    // An unclean one does NOT advance, and that asymmetry is the whole
    // safety property of automatic ingestion. "Anything ambiguous stops and
    // is surfaced" cannot be enforced by an admin screen, because the
    // failure mode is nobody opening it: a report that had an unmatched
    // marker, a missing range or a disagreement with the lab's own high/low
    // flag would sail through to clinician review carrying a hole nobody had
    // been told about. Stopping at PARSED puts it in the "needs an admin"
    // bucket by construction, because `review` may only be performed from
    // ADMIN_VERIFIED (lib/reportTransitions.ts) and there is no other route.
    //
    // Clinician review and release remain untouched, explicit, human actions
    // either way. Automatic ingestion is not automatic publication, and
    // neither is an admin linking a result to an account.
    await tx.report.update({
      where: { id: report.id },
      data: verified ? { status: 'ADMIN_VERIFIED', verifiedAt: new Date() } : { status: 'PARSED' },
    });

    return report.id;
  });

  return {
    reportId,
    markerCount: matchedRows.length,
    excludedCount: exclusions.length,
    disagreementCount,
    mappingFailures,
    verified,
    holdReasons,
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
