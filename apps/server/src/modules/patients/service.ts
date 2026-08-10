import { prisma } from '../../db/client.js';
import { decryptField } from '../../lib/crypto.js';
import { decodeResultValue } from '../../lib/resultValue.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { sourceLabel } from '../../lib/sourceLabel.js';
import { convertToDisplayUnit, hasKnownConversion } from '../../lib/unitConversion.js';
import { optimalContextForPatient, optimalFor } from '../../lib/optimalRange.js';
import { personalMeasurementsOf, PERSONAL_MEASUREMENTS_CATEGORY_KEY } from '../../lib/personalMeasurements.js';
import type { ConsentType } from '@aspire-bloods/shared';
import { formatReportTitle, hasResultValue } from '@aspire-bloods/shared';

/**
 * How far past the reference bound a result has to sit before it counts as
 * significantly out — in the units the result itself is reported in.
 *
 * Sent to the client because the portal draws it: the trend chart's yellow
 * bands stop and its red bands start exactly here, and the range bar's
 * gradient turns at the same point. Deriving it client-side from a default
 * multiplier would put the band edge somewhere other than where the status
 * actually changes for any marker that overrides the default — a chart whose
 * shading disagrees with its own status label.
 *
 * Same expression as lib/markerStatus.ts computeMarkerStatus, which is the
 * function that decides the status in the first place.
 */
function severityThreshold(
  marker: { severityMultiplier: number; severityAbsoluteDelta: number | null },
  low: number,
  high: number,
): number {
  return marker.severityAbsoluteDelta ?? (high - low) * marker.severityMultiplier;
}

export class PatientAccessError extends Error {
  constructor(
    message = 'Not found',
    public status = 404,
  ) {
    super(message);
  }
}

export async function listReportsForPatient(patientId: string) {
  // Voided is a state change, not a deletion — it disappears from every
  // patient-facing query but stays fully intact (and visible, marked) for
  // admins. See reports/service.ts voidReport().
  const reports = await prisma.report.findMany({
    where: { patientId, voidedAt: null },
    include: { panel: true, source: true, results: true },
    orderBy: { sampleDate: 'desc' },
  });

  return reports.map((r) => {
    const released = r.status === 'RELEASED';
    // Counted from what each state actually IS, never one subtracted from the
    // other. `length - attentionCount` silently folded every result with no
    // status — nothing measured, nothing comparable — into "in range", which
    // is the same false statement this whole change exists to remove, just
    // arrived at by arithmetic instead of by a default.
    const evaluated = r.results.filter((res) => res.status !== null);
    const attentionCount = evaluated.filter((res) => res.status !== 'IN_RANGE').length;
    const inRangeCount = evaluated.filter((res) => res.status === 'IN_RANGE').length;
    return {
      reportId: r.id,
      // Nullable by design (schema: Report.panelId is optional). The title is
      // composed here rather than on the client so the portal, the PDF and the
      // escalation email cannot drift apart — formatReportTitle falls back to
      // "12 markers · 4 August 2026" rather than an empty heading. panelName
      // and markerCount stay on the payload for callers that need the parts
      // rather than the composed string.
      panelName: r.panel?.name ?? null,
      title: formatReportTitle(r.panel?.name, r.results.length, r.sampleDate),
      sampleDate: r.sampleDate.toISOString().slice(0, 10),
      patientStatus: released ? ('RELEASED' as const) : ('PENDING' as const),
      // Sent regardless of release state: it's the fallback title's raw
      // material, and a count of markers is not itself a clinical value.
      markerCount: r.results.length,
      inRangeCount: released ? inRangeCount : undefined,
      attentionCount: released ? attentionCount : undefined,
      sourceLabel: released ? sourceLabel(r.source.key, r.source.name) : undefined,
    };
  });
}

export async function getReleasedReportForPatient(patientId: string, reportId: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      panel: true,
      source: true,
      originalPdfFile: { select: { originalFilename: true } },
      // Height, weight, the two circumferences, pulse and both blood
      // pressures, as recorded at the clinic visit. Carried as values with
      // units under their own health area — never as results with a range or
      // a status. See lib/personalMeasurements.ts for why.
      measurements: true,
      results: {
        // Narrowed to what is actually read. The explanation table holds four
        // long prose fields and only `whatItIs` reaches this payload (as the
        // one-line gloss); fetching all four for each of a 436-marker panel's
        // results was several hundred kilobytes of text pulled out of Postgres
        // and dropped on the floor.
        select: {
          markerId: true,
          unit: true,
          status: true,
          valueEncrypted: true,
          amendedAt: true,
          // Health areas ride along with each result so the report can group by
          // them without a second round trip, and so the category summary bars
          // are computed from the same rows the grid renders — two queries
          // would eventually disagree with each other about a count.
          marker: {
            select: {
              key: true,
              name: true,
              resultType: true,
              aliases: true,
              severityMultiplier: true,
              severityAbsoluteDelta: true,
              explanation: { select: { whatItIs: true } },
              categories: {
                select: {
                  category: {
                    select: { id: true, key: true, name: true, resultType: true, note: true, sortOrder: true },
                  },
                },
              },
            },
          },
          referenceRange: { select: { low: true, high: true, unit: true } },
        },
      },
    },
  });

  if (!report || report.patientId !== patientId || report.status !== 'RELEASED' || report.voidedAt) {
    throw new PatientAccessError();
  }

  // Age and sex, once, for the whole report. Personalises the advisory optimal
  // band only — the lab's reference range on each result is untouched by it
  // and remains the sole authority for every marker's status.
  const optimalCtx = await optimalContextForPatient(patientId);

  // The health area's own framing ("Recorded at your clinic visit, not
  // measured from your blood sample"), read from the catalogue rather than
  // written into the portal — one place says what this section is.
  const measurementsCategory =
    personalMeasurementsOf(report.measurements).length > 0
      ? await prisma.markerCategory.findUnique({
          where: { key: PERSONAL_MEASUREMENTS_CATEGORY_KEY },
          select: { note: true },
        })
      : null;

  // Every health area this report actually touches, in the catalogue's own
  // order. Derived from the results rather than from the panel: a report can
  // be a handful of individual markers with no panel behind it at all, and a
  // panel's full category list would then promise sections that aren't there.
  const categoryById = new Map<
    string,
    { key: string; name: string; resultType: string; note: string | null; sortOrder: number }
  >();
  for (const r of report.results) {
    for (const m of r.marker.categories) {
      categoryById.set(m.category.id, {
        key: m.category.key,
        name: m.category.name,
        resultType: m.category.resultType,
        note: m.category.note,
        sortOrder: m.category.sortOrder,
      });
    }
  }

  return {
    reportId: report.id,
    panelName: report.panel?.name ?? null,
    markerCount: report.results.length,
    title: formatReportTitle(report.panel?.name, report.results.length, report.sampleDate),
    sampleDate: report.sampleDate.toISOString().slice(0, 10),
    sourceLabel: sourceLabel(report.source.key, report.source.name),
    // Whether there is a laboratory PDF behind this report at all. A manually
    // entered report has none, and the portal used to offer the download
    // anyway and let it 404 — a button that is known in advance to fail.
    hasOriginalPdf: !!report.originalPdfFileId,
    originalFilename: report.originalPdfFile?.originalFilename ?? null,
    // Panels state a turnaround; a released report has already arrived, so this
    // is only carried for the repeat-programme note on the page.
    repeatIntervalMonths: report.panel?.repeatIntervalMonths ?? null,
    categories: [...categoryById.values()].sort((a, b) => a.sortOrder - b.sortOrder),
    // Personal Health Measurements, as its own section rather than as rows in
    // the grid. Empty for every report that carries none — manual entry and
    // PDF upload never do — and an empty array renders nothing at all.
    personalMeasurements: personalMeasurementsOf(report.measurements),
    personalMeasurementsNote: measurementsCategory?.note ?? null,
    // A result with nothing in it renders nowhere, so it is not sent. This is
    // the existing product rule ("a marker with no result renders nowhere —
    // never a placeholder, never an empty row") applied at the only layer that
    // can actually guarantee it: a row that never leaves the server cannot be
    // rendered by a screen that forgot to guard. It also repairs the rows
    // already in the database that were written with a placeholder value and
    // stamped IN_RANGE — decodeResultValue reads those back as nothing, so
    // they drop out here rather than reaching the patient.
    markers: report.results
      .map((r) => ({ r, decoded: decodeResultValue(decryptField(r.valueEncrypted)) }))
      .filter(({ decoded }) => hasResultValue(decoded))
      .map(({ r, decoded }) => {
      const measured = r.marker.resultType === 'MEASURED';
      return {
        markerId: r.markerId,
        name: r.marker.name,
        // value/valueText — exactly one is set; textual lab results ("< 0.6",
        // "Not detected") are shown verbatim rather than coerced to NaN.
        ...decoded,
        unit: r.unit,
        referenceLow: r.referenceRange.low,
        referenceHigh: r.referenceRange.high,
        // Where "above range" becomes "significantly above range" for this
        // marker, so the portal's bands and gradients turn at the same point
        // the status does. See severityThreshold above.
        severityThreshold: severityThreshold(r.marker, r.referenceRange.low, r.referenceRange.high),
        // Nullable, and passed through as-is. Null means this result has no
        // position on its reference range, and the card then shows the value
        // with the reason in words instead of a status, a tint or a mark.
        status: r.status,
        // What KIND of result this is. Only MEASURED reaches the main grid, the
        // counts strip, the category bars and Trends; the other three types get
        // their own sections with their own framing, because a genetic risk
        // category and a potassium are not the same kind of statement about a
        // person and must not be laid out as though they were.
        resultType: r.marker.resultType,
        // Health areas, for grouping and for the category filter.
        categoryKeys: r.marker.categories.map((m) => m.category.key),
        // Abbreviations, so a search for "ALT" finds Alanine Aminotransferase.
        aliases: r.marker.aliases,
        // Null for the majority of markers — most have no established optimal,
        // and those show the lab range alone with nothing said about optimal.
        // Never resolved at all for a non-MEASURED marker: a genetic risk
        // category has no units to compare a band against.
        optimal: measured ? optimalFor(r.marker.key, r.unit, decoded.value, optimalCtx) : null,
        gloss: r.marker.explanation?.whatItIs ?? '',
        // A clinical record that silently changes is worse than no record —
        // the patient always sees the current value, but knows it changed.
        amendedAt: r.amendedAt,
      };
      }),
  };
}

export async function getMarkerTrendForPatient(patientId: string, markerId: string) {
  const marker = await prisma.marker.findUnique({ where: { id: markerId }, include: { explanation: true } });
  if (!marker) throw new PatientAccessError();

  const results = await prisma.reportResult.findMany({
    where: { markerId, report: { patientId, status: 'RELEASED', voidedAt: null } },
    include: { report: { include: { source: true } }, referenceRange: true },
    orderBy: { report: { sampleDate: 'asc' } },
  });

  if (results.length === 0) throw new PatientAccessError();

  // Written copy is shown, full stop. reviewStatus used to gate this, and the
  // result was that every marker whose copy had not yet been through the
  // review queue showed a line saying its explanation was still being
  // finalised — on the most-read card of a report someone paid four figures
  // for. reviewStatus is still recorded, still audited and still drives the
  // admin review queue; it is a fact about who has checked the wording, which
  // is a thing the clinical team needs and a thing no patient should be shown.
  // A marker with no copy at all returns null and the section simply is not
  // rendered: no placeholder, in keeping with the rest of the product.

  // Phase 2 §2.3/§2.4: normalise to one display unit (the marker's own
  // default) for plotting, via an explicit, named conversion — never a
  // silent coercion. Every point keeps its original value/unit alongside
  // the converted one. If any point can't be converted (no known rule),
  // the whole series is downgraded to not-comparable rather than mixing
  // units on one axis.
  const displayUnit = marker.defaultUnit;
  let allConvertible = true;

  // Rows with nothing in them are dropped before anything is derived from
  // them. `latest` below is the last entry in this list and drives the whole
  // page — the headline value, the range bar, the out-of-range notice — so a
  // valueless row landing there would put "In range" and a green wash on a
  // marker that was never measured. That is the bug this file's share of.
  const measuredResults = results.filter((r) => hasResultValue(decodeResultValue(decryptField(r.valueEncrypted))));
  if (measuredResults.length === 0) throw new PatientAccessError();

  const allPoints = measuredResults.map((r) => {
    const decoded = decodeResultValue(decryptField(r.valueEncrypted));
    // A textual result has nothing to convert and nothing to plot — it is
    // carried through verbatim and excluded from the chart series below.
    const valueConversion =
      decoded.value !== null ? convertToDisplayUnit(marker.key, decoded.value, r.unit, displayUnit) : null;
    // Convertibility is asked of the registry rather than tested with a raw
    // string compare: the lab prints "mmol/l" where the catalogue holds
    // "mmol/L", and treating those as two units with no rule between them
    // marked ordinary same-source series as not comparable — which showed the
    // patient unconnected points and a note about sources, for a series where
    // every value came from one source and nothing was converted at all.
    const valueConvertible = decoded.value === null || hasKnownConversion(marker.key, r.unit, displayUnit);
    const rangeConvertible = hasKnownConversion(marker.key, r.referenceRange.unit, displayUnit);
    if (!valueConvertible || !rangeConvertible) allConvertible = false;

    const lowConversion = convertToDisplayUnit(marker.key, r.referenceRange.low, r.referenceRange.unit, displayUnit);
    const highConversion = convertToDisplayUnit(marker.key, r.referenceRange.high, r.referenceRange.unit, displayUnit);

    return {
      reportId: r.reportId,
      sampleDate: r.report.sampleDate.toISOString().slice(0, 10),
      value: valueConversion ? valueConversion.value : null,
      valueText: decoded.valueText,
      unit: valueConversion ? valueConversion.unit : r.unit,
      converted: valueConversion?.converted ?? false,
      originalValue: valueConversion ? valueConversion.originalValue : null,
      originalUnit: valueConversion ? valueConversion.originalUnit : r.unit,
      status: r.status,
      referenceLow: lowConversion.value,
      referenceHigh: highConversion.value,
      // In display units, like the bounds beside it — computed from the
      // converted range so the chart's band edges land on the same axis as
      // the points it is drawing.
      severityThreshold: severityThreshold(marker, lowConversion.value, highConversion.value),
      sourceKey: r.report.source.key,
      sourceLabel: sourceLabel(r.report.source.key, r.report.source.name),
      amendedAt: r.amendedAt,
    };
  });

  // The chart plots numbers; textual results stay visible on the report page
  // and in `latest` below but can't be a point on a line. A point also needs a
  // status to be drawn — the mark's shape and colour both come from it — and
  // in practice the two conditions coincide, since every numeric value against
  // a resolved range derives one.
  const trend = allPoints.filter(
    (p): p is typeof p & { value: number; status: NonNullable<typeof p.status> } =>
      p.value !== null && p.status !== null,
  );

  // Final flag: the admin/marker-config setting AND actual convertibility
  // both have to hold. A marker can be flagged comparable in principle but
  // still fail here if a specific pair of units has no registered rule —
  // we never draw a line across values we can't honestly relate.
  const crossSourceComparable = marker.crossSourceComparable && allConvertible;

  const latest = allPoints[allPoints.length - 1];

  // One band for the whole marker: it depends on age and sex, not on the
  // report a given point came from, so it is resolved once and applies to the
  // latest result, the range bar and every point on the chart alike.
  const optimalCtx = await optimalContextForPatient(patientId);
  const optimal = optimalFor(marker.key, displayUnit, latest.value, optimalCtx);

  let outOfRangeNotice: string | null = null;
  // `!== 'IN_RANGE'` alone would fire on a result with NO status, telling
  // someone to speak to their GP about a comparison that was never made.
  if (latest.status !== null && latest.status !== 'IN_RANGE') {
    const copy = await prisma.copyBlock.findUnique({ where: { slug: 'out_of_range_prompt' } });
    outOfRangeNotice = copy?.body ?? null;
  }

  return {
    markerId: marker.id,
    name: marker.name,
    unit: displayUnit,
    crossSourceComparable,
    /** Null when this marker has no established optimal range. Nothing is then said about optimal anywhere on the page. */
    optimal,
    latest: {
      markerId: marker.id,
      name: marker.name,
      value: latest.value,
      valueText: latest.valueText,
      unit: latest.unit,
      referenceLow: latest.referenceLow,
      referenceHigh: latest.referenceHigh,
      severityThreshold: latest.severityThreshold,
      status: latest.status,
      optimal,
      sourceLabel: latest.sourceLabel,
      gloss: marker.explanation?.whatItIs ?? '',
      amendedAt: latest.amendedAt,
    },
    trend,
    outOfRangeNotice,
    explanation: marker.explanation
      ? {
          whatItIs: marker.explanation.whatItIs,
          highMeans: marker.explanation.highMeans,
          lowMeans: marker.explanation.lowMeans,
          lifestyleContext: marker.explanation.lifestyleContext,
        }
      : null,
  };
}

export async function getConsentStatus(patientId: string) {
  const types: ConsentType[] = ['DATA_PROCESSING', 'RESULTS_STORAGE', 'COMMS_EMAIL', 'COMMS_SMS'];
  const statuses = await Promise.all(
    types.map(async (type) => {
      const latest = await prisma.consentRecord.findFirst({
        where: { userId: patientId, consentVersion: { type } },
        include: { consentVersion: true },
        orderBy: { createdAt: 'desc' },
      });
      return {
        type,
        granted: latest?.granted ?? false,
        withdrawn: !!latest?.withdrawnAt,
        version: latest?.consentVersion.version ?? null,
        bodyText: latest?.consentVersion.bodyText ?? null,
        grantedAt: latest?.createdAt ?? null,
        withdrawnAt: latest?.withdrawnAt ?? null,
      };
    }),
  );
  return statuses;
}

export async function withdrawConsent(patientId: string, type: ConsentType, ip: string | null) {
  const latest = await prisma.consentRecord.findFirst({
    where: { userId: patientId, consentVersion: { type }, granted: true, withdrawnAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!latest) throw new PatientAccessError('No active consent of this type to withdraw', 400);

  await prisma.consentRecord.update({ where: { id: latest.id }, data: { withdrawnAt: new Date() } });

  await recordAuditLog({
    actorUserId: patientId,
    action: 'CONSENT_WITHDRAWN',
    targetType: 'ConsentRecord',
    targetId: latest.id,
    ipAddress: ip,
    metadata: { type },
  });
}

export async function requestErasure(patientId: string) {
  const existing = await prisma.erasureRequest.findFirst({
    where: { userId: patientId, status: { in: ['REQUESTED', 'SCHEDULED'] } },
  });
  if (existing) return existing;

  const request = await prisma.erasureRequest.create({ data: { userId: patientId } });

  await recordAuditLog({
    actorUserId: patientId,
    action: 'ERASURE_REQUESTED',
    targetType: 'ErasureRequest',
    targetId: request.id,
  });

  return request;
}
