import type { Prisma } from '@prisma/client';
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
  // MEASURED marker is allowed to. GENETIC / SENSITIVITY / COMPOSITION markers
  // are a different kind of result with no range and no status (CLAUDE.md), so
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
    const marker = findBestMarkerMatch(row.rawName, measuredMarkers);
    if (!marker) {
      mappingFailures.push({ markerName: row.rawName, reason: 'No matching marker in the catalogue' });
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
  if (matchedRows.length === 0) {
    throw new MaterialiseError(
      `Every result in this delivery was withheld by the laboratory (${exclusions.length} test(s)), so no report was created.`,
      mappingFailures,
    );
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

  return {
    reportId,
    markerCount: matchedRows.length,
    excludedCount: exclusions.length,
    disagreementCount: matchedRows.filter((r) => r.labStatusDisagrees).length,
    mappingFailures,
  };
}

/**
 * Holds a result nobody can be attached to yet, for an admin to link
 * explicitly. Upsert by externalId so a redelivery refreshes the same queue
 * row instead of giving the admin two copies of the same order to choose
 * between.
 *
 * A row that has already been linked or dismissed is left alone — a later
 * poll must not silently resurrect a decision an admin has already made.
 */
export async function parkAsUnmatched(
  sourceKey: string,
  externalId: string,
  parsed: ParsedReport,
): Promise<void> {
  const claimed = parsed.claimedPatient ?? null;
  const data = {
    sourceKey,
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
