/**
 * ============================================================================
 *  ⚠  DEMO DATA GENERATOR — SYNTHETIC. NOT A REAL PATIENT, NOT REAL RESULTS. ⚠
 * ============================================================================
 *
 * Builds the demo patient's four reports FROM THE CATALOGUE THAT IS ACTUALLY IN
 * THE DATABASE. Nothing here hardcodes a marker name, a panel composition or a
 * health area: it reads the Panel → PanelMarker → Marker graph seeded by
 * seedCatalogue.ts and generates values against it. If the catalogue grows a
 * marker, the demo grows a result for it on the next run.
 *
 * What the old generator produced, and why this replaced it: about a dozen
 * markers, every one in range, no panel behind most of them, and none of the
 * three non-measured result types. A demo login showed a portal with no tints,
 * no category bars worth the name, empty food-sensitivity / genetic /
 * microbiome sections, and a Trends page with almost nothing to plot. It
 * demonstrated the shell of the product rather than the product.
 *
 * WHAT THIS IS ENGINEERED TO MAKE VISIBLE — each of these is asserted by
 * tests/demoSeedData.test.ts, so a future edit that quietly drops one fails:
 *
 *   · All five statuses, so all five tints render. Quotas per report, assigned
 *     before any random rolling, so "mostly in range with a realistic spread"
 *     is a guarantee rather than a probability.
 *   · Every MEASURED health area, so the per-category summary bars have
 *     content in every bar.
 *   · Markers across two and three reports (real trend lines) AND a marker in
 *     exactly one (the single-point, no-line case).
 *   · Non-numeric results: a below-detection-limit "< 0.6", a "< 5.0", and
 *     "Not detected" on the qualitative markers that genuinely have no unit.
 *   · Markers with a published optimal range and markers with none, so both
 *     presentations appear.
 *   · All four result types — MEASURED, GENETIC, SENSITIVITY, COMPOSITION —
 *     with food sensitivity spanning all nine food groups, so the separated
 *     non-measured sections are populated rather than absent.
 *
 * DETERMINISM. Every value comes from a hash of (marker key, report index), so
 * two runs against the same catalogue produce the same numbers. That is what
 * makes the seed idempotent in the way that matters: re-running it does not
 * silently rewrite the patient's history into a different story.
 *
 * REFERENCE RANGES. Taken from the catalogue's own ReferenceRange rows where
 * they exist, preferring a sex-specific row over ANY for the demo patient. The
 * catalogue only carries ranges for a minority of the ~195 measured analytes
 * (Randox publish them on the report, not in the product catalogue), so the
 * rest get a deterministic synthetic band — counted and reported in the run
 * log as `syntheticRanges`, never silently. Either way the band lands on the
 * RESULT ROW via verifyReport, never on the marker.
 */
import type { MarkerStatus, ResultType } from '@aspire-bloods/shared';
import { FOOD_SENSITIVITY_GROUPS } from '@aspire-bloods/shared';
import { prisma } from '../../db/client.js';

/** The three panels the clinic sells. Report 4 deliberately has no panel. */
const PANEL_KEYS = { core: 'core', insight: 'insight-360', signature: 'signature' } as const;

export interface GeneratedResult {
  markerId: string;
  markerKey: string;
  resultType: ResultType;
  value: number | string;
  unit: string;
  referenceLow: number;
  referenceHigh: number;
  /** What the value was built to produce. Only meaningful for numeric MEASURED rows. */
  intendedStatus: MarkerStatus | null;
}

export interface GeneratedReport {
  panelId: string | null;
  panelKey: string | null;
  panelName: string | null;
  sourceKey: string;
  sampleDate: Date;
  demonstrates: string;
  results: GeneratedResult[];
}

export interface DemoDataDiagnostics {
  byResultType: Record<ResultType, number>;
  byIntendedStatus: Record<MarkerStatus, number>;
  measuredCategoriesCovered: number;
  measuredCategoriesTotal: number;
  uncoveredCategoryKeys: string[];
  syntheticRanges: number;
  catalogueRanges: number;
  nonNumericResults: number;
  markersInOneReportOnly: number;
  markersInTwoOrMoreReports: number;
  foodSensitivityGroups: number;
}

// ---------------------------------------------------------------------------
// Deterministic pseudo-randomness. Seeded per (marker, report) so the same
// catalogue always yields the same demo history.
// ---------------------------------------------------------------------------

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable shuffle — same input order, same output order, every run. */
function deterministicShuffle<T>(items: T[], seed: string): T[] {
  const r = mulberry32(hash32(seed));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function roundForMagnitude(value: number, high: number): number {
  return Number(value.toFixed(decimalsFor(high)));
}

/**
 * How many decimals a value at this magnitude should carry, and — the part
 * that matters — fine enough that the rounding step still fits inside the
 * severity threshold.
 *
 * Without the second condition, rounding silently defeats the whole
 * generator: a 10–20 band with an absolute severity delta of 2 wants a HIGH
 * value somewhere in (20, 22], the magnitude rule rounds to whole numbers,
 * and 20.24 becomes 20 — which is IN_RANGE. The result is a demo with fewer
 * out-of-range markers than it was asked for and no error anywhere. Caught by
 * tests/demoSeedData.test.ts, which is why that test exists.
 */
function decimalsFor(high: number, threshold?: number): number {
  let d = high < 2 ? 2 : high < 20 ? 1 : 0;
  if (threshold !== undefined && threshold > 0) {
    while (10 ** -d > threshold / 4 && d < 6) d += 1;
  }
  return d;
}

// ---------------------------------------------------------------------------
// Values engineered to land on a chosen status
// ---------------------------------------------------------------------------

export interface Band {
  low: number;
  high: number;
  unit: string;
  fromCatalogue: boolean;
}

export interface MarkerRow {
  id: string;
  key: string;
  name: string;
  resultType: ResultType;
  defaultUnit: string;
  severityMultiplier: number;
  severityAbsoluteDelta: number | null;
}

/**
 * Mirrors lib/markerStatus.ts computeMarkerStatus, inverted: given the status
 * we want the portal to show, produce a value that genuinely computes to it.
 * The seed never writes a status — verifyReport derives it from the value and
 * the band, exactly as it does for a real report — so these two have to agree.
 */
export function valueForStatus(status: MarkerStatus, band: Band, marker: MarkerRow, r: () => number): number {
  const width = band.high - band.low;
  const usableWidth = width > 0 ? width : Math.max(Math.abs(band.high), 1);
  const threshold = marker.severityAbsoluteDelta ?? usableWidth * marker.severityMultiplier;

  const decimals = decimalsFor(band.high, threshold);
  const step = 10 ** -decimals;
  const round = (v: number) => Number(v.toFixed(decimals));
  // Rounding is applied first and then corrected, rather than trusted: see
  // decimalsFor. A value that lands on the boundary is nudged one step clear
  // of it, so the status the seed asked for is the status the portal derives.
  const clampAbove = (v: number, floorExclusive: number) => Math.max(round(v), round(floorExclusive + step));
  const clampBelow = (v: number, ceilingExclusive: number) => Math.min(round(v), round(ceilingExclusive - step));

  switch (status) {
    case 'IN_RANGE': {
      const v = round(band.low + usableWidth * (0.18 + r() * 0.64));
      return Math.min(Math.max(v, round(band.low)), round(band.high));
    }
    case 'HIGH':
      return clampAbove(band.high + threshold * (0.12 + r() * 0.55), band.high);
    case 'SIGNIFICANT_HIGH':
      return clampAbove(band.high + threshold * (1.3 + r() * 0.8), band.high + threshold);
    case 'LOW':
      return clampBelow(band.low - threshold * (0.12 + r() * 0.55), band.low);
    case 'SIGNIFICANT_LOW':
      return clampBelow(band.low - threshold * (1.3 + r() * 0.8), band.low - threshold);
  }
}

/**
 * A below-range value only exists if the band has somewhere below it to go.
 * Markers whose range starts at zero (most enzymes and lipids) cannot be LOW
 * without going negative, so they are never chosen for a below-range quota.
 */
export function canGoBelow(band: Band, marker: MarkerRow): boolean {
  const width = band.high - band.low;
  const threshold = marker.severityAbsoluteDelta ?? (width > 0 ? width : 1) * marker.severityMultiplier;
  return band.low - threshold * 2.2 > 0;
}

/**
 * A band for a marker the catalogue has no ReferenceRange for. Deterministic
 * from the marker key, and shaped like a plausible assay range rather than a
 * uniform 0–1: the point is that the portal's range bars, tints and trend
 * charts get realistic geometry to render.
 */
export function syntheticBand(marker: MarkerRow): Band {
  const magnitudes = [0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500];
  const base = magnitudes[hash32(marker.key) % magnitudes.length];
  const low = roundForMagnitude(base * 0.5, base * 1.5);
  const high = roundForMagnitude(base * 1.5, base * 1.5);
  return { low, high, unit: marker.defaultUnit, fromCatalogue: false };
}

// ---------------------------------------------------------------------------
// Non-measured vocabularies. Real reporting language for each type — a
// genetic indicator reports a tendency, a food sensitivity an IgG class, a
// microbiome measure a proportion of the whole.
// ---------------------------------------------------------------------------

const GENETIC_OUTCOMES = [
  'Typical result',
  'Typical result',
  'Typical result',
  'Reduced tendency',
  'Increased tendency',
  'Slightly increased tendency',
] as const;

const SENSITIVITY_CLASSES = [
  'Normal',
  'Normal',
  'Normal',
  'Normal',
  'Normal',
  'Normal',
  'Borderline',
  'Elevated',
] as const;

/** Qualitative MEASURED markers — the catalogue gives these no unit on purpose. */
const QUALITATIVE_OUTCOMES = ['Not detected', 'Not detected', 'Not detected', 'Negative', 'Normal'] as const;

function nonMeasuredValue(marker: MarkerRow, reportIndex: number): string {
  const r = mulberry32(hash32(`${marker.key}:${reportIndex}:nm`));
  if (marker.resultType === 'GENETIC') {
    return GENETIC_OUTCOMES[Math.floor(r() * GENETIC_OUTCOMES.length)];
  }
  if (marker.resultType === 'SENSITIVITY') {
    return SENSITIVITY_CLASSES[Math.floor(r() * SENSITIVITY_CLASSES.length)];
  }
  // COMPOSITION — a proportion of the whole, which is what makes it not
  // comparable with a blood measurement (see RESULT_TYPE_RULES.COMPOSITION).
  return `${(1 + r() * 34).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// The clinical narrative. A handful of markers are scripted across the series
// so the demo tells a story rather than showing noise; everything else on the
// panel is generated around them.
// ---------------------------------------------------------------------------

interface ScriptedValue {
  value: number | string;
  low?: number;
  high?: number;
}

/** markerKey → per-report-index value. Absent entries fall through to generation. */
const NARRATIVE: Record<string, Record<number, ScriptedValue>> = {
  // Clearly low at baseline, then the classic supplementation recovery.
  'vitamin-d': {
    0: { value: 31, low: 50, high: 250 },
    1: { value: 58, low: 50, high: 250 },
    2: { value: 104, low: 75, high: 200 },
  },
  // Creeping up, tipping just over on the newest panel.
  hba1c: {
    0: { value: 34, low: 20, high: 42 },
    1: { value: 39, low: 20, high: 42 },
    2: { value: 44, low: 20, high: 42 },
  },
  // A steady fall, ending frankly low.
  ferritin: {
    0: { value: 88, low: 30, high: 400 },
    1: { value: 52, low: 30, high: 400 },
    2: { value: 18, low: 20, high: 200 },
  },
  // Below the assay's detection limit on report 2 (textual, skipped by the
  // trend line), a one-off spike on report 3, settled by report 4.
  'hs-crp': {
    0: { value: 0.8, low: 0, high: 3 },
    1: { value: '< 0.6', low: 0, high: 3 },
    2: { value: 9.6, low: 0, high: 3 },
    3: { value: 1.1, low: 0, high: 3 },
  },
  // The earliest marker of the insulin resistance the HbA1c drift hints at.
  // A functional band (2–10), narrower than the assay's, is what makes this
  // read as significantly high rather than a shrug.
  'fasting-insulin': { 2: { value: 24.6, low: 2, high: 10 } },
  esr: { 2: { value: 32, low: 0, high: 20 } },
};

// ---------------------------------------------------------------------------
// Per-report status quotas. Assigned before any rolling, so the spread is a
// guarantee: "mostly in range, with at least two significantly out somewhere
// and several high and several low".
// ---------------------------------------------------------------------------

interface ReportPlan {
  panelKey: string | null;
  sourceKey: string;
  monthsAgo: number;
  dayOfMonth: number;
  demonstrates: string;
  quotas: { HIGH: number; LOW: number; SIGNIFICANT_HIGH: number; SIGNIFICANT_LOW: number };
  /** Report 4 only: how many markers to pick when there is no panel behind it. */
  adHocMarkerCount?: number;
}

const REPORT_PLANS: ReportPlan[] = [
  {
    panelKey: PANEL_KEYS.core,
    sourceKey: 'randox_portal',
    monthsAgo: 18,
    dayOfMonth: 11,
    demonstrates: 'Core baseline. Vitamin D clearly low, everything else settled.',
    quotas: { HIGH: 4, LOW: 3, SIGNIFICANT_HIGH: 1, SIGNIFICANT_LOW: 0 },
  },
  {
    panelKey: PANEL_KEYS.insight,
    sourceKey: 'randox_portal',
    monthsAgo: 12,
    dayOfMonth: 19,
    demonstrates:
      'Insight 360 — the full measured set across every health area, so the category bars and the counts strip have real content. Carries the below-detection-limit hs-CRP.',
    quotas: { HIGH: 8, LOW: 6, SIGNIFICANT_HIGH: 1, SIGNIFICANT_LOW: 1 },
  },
  {
    panelKey: PANEL_KEYS.signature,
    sourceKey: 'randox_portal',
    monthsAgo: 6,
    dayOfMonth: 3,
    demonstrates:
      'Signature — everything Insight has plus food sensitivity across all nine groups, genetic indicators and microbiome composition, so all three non-measured sections are populated.',
    quotas: { HIGH: 9, LOW: 7, SIGNIFICANT_HIGH: 2, SIGNIFICANT_LOW: 1 },
  },
  {
    panelKey: null,
    sourceKey: 'aspire_inhouse',
    monthsAgo: 0,
    dayOfMonth: 4,
    demonstrates:
      'No panel attached, so the title falls back to the "12 markers · <date>" style. Also carries the marker that appears in no other report — the single trend point with no line.',
    quotas: { HIGH: 1, LOW: 1, SIGNIFICANT_HIGH: 0, SIGNIFICANT_LOW: 0 },
    adHocMarkerCount: 12,
  },
];

function sampleDateFor(plan: ReportPlan, now: Date): Date {
  if (plan.monthsAgo === 0) {
    // Most recent: a few days back, not today, so "released" reads plausibly.
    const d = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 15));
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - plan.monthsAgo, plan.dayOfMonth, 9, 15));
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export async function buildDemoReports(opts: {
  now: Date;
  patientSex: 'MALE' | 'FEMALE' | 'ANY';
}): Promise<{ reports: GeneratedReport[]; diagnostics: DemoDataDiagnostics }> {
  const panelKeys = REPORT_PLANS.map((p) => p.panelKey).filter((k): k is string => k !== null);
  const panels = await prisma.panel.findMany({
    where: { key: { in: panelKeys } },
    include: {
      markers: {
        include: {
          marker: {
            select: {
              id: true,
              key: true,
              name: true,
              resultType: true,
              defaultUnit: true,
              severityMultiplier: true,
              severityAbsoluteDelta: true,
              isActive: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  const panelByKey = new Map(panels.map((p) => [p.key, p]));
  for (const key of panelKeys) {
    if (!panelByKey.has(key)) {
      throw new Error(`Panel "${key}" not found — run \`npm run prisma:seed\` (the catalogue seed) first.`);
    }
  }

  // Catalogue ranges for every marker in play, sex-preferred for this patient.
  const allMarkerIds = [...new Set(panels.flatMap((p) => p.markers.map((pm) => pm.markerId)))];
  const catalogueRanges = await prisma.referenceRange.findMany({
    where: { markerId: { in: allMarkerIds }, sex: { in: [opts.patientSex, 'ANY'] } },
    select: { markerId: true, sex: true, unit: true, low: true, high: true },
  });
  const bandByMarkerId = new Map<string, Band>();
  for (const r of catalogueRanges) {
    const existing = bandByMarkerId.get(r.markerId);
    // A sex-specific row beats a blanket ANY one, matching resolveReferenceRange.
    if (existing && r.sex === 'ANY') continue;
    bandByMarkerId.set(r.markerId, { low: r.low, high: r.high, unit: r.unit, fromCatalogue: true });
  }

  // The marker for report 4 that appears nowhere else: something real from the
  // catalogue that is on none of the three panels, so the single-trend-point
  // case is genuine rather than manufactured.
  const onAPanel = new Set(allMarkerIds);
  const offPanelCandidates = await prisma.marker.findMany({
    where: { resultType: 'MEASURED', isActive: true, id: { notIn: [...onAPanel] }, defaultUnit: { not: '' } },
    select: {
      id: true,
      key: true,
      name: true,
      resultType: true,
      defaultUnit: true,
      severityMultiplier: true,
      severityAbsoluteDelta: true,
    },
    orderBy: { key: 'asc' },
    take: 1,
  });

  const reports: GeneratedReport[] = [];
  const syntheticRangeMarkers = new Set<string>();
  const catalogueRangeMarkers = new Set<string>();
  let nonNumericResults = 0;
  const byResultType: Record<ResultType, number> = { MEASURED: 0, GENETIC: 0, SENSITIVITY: 0, COMPOSITION: 0 };
  const byIntendedStatus: Record<MarkerStatus, number> = {
    IN_RANGE: 0,
    HIGH: 0,
    LOW: 0,
    SIGNIFICANT_HIGH: 0,
    SIGNIFICANT_LOW: 0,
  };
  const reportsPerMarkerKey = new Map<string, number>();
  /** Set once, so exactly one "< 5.0" appears in the whole history. */
  let comparatorPlaced = false;

  for (const [index, plan] of REPORT_PLANS.entries()) {
    const panel = plan.panelKey ? panelByKey.get(plan.panelKey)! : null;

    let markers: MarkerRow[];
    if (panel) {
      markers = panel.markers.filter((pm) => pm.marker.isActive).map((pm) => pm.marker as MarkerRow);
    } else {
      // Ad-hoc report: a small set drawn from the core panel, plus the
      // off-panel marker that appears in no other report.
      const corePanel = panelByKey.get(PANEL_KEYS.core)!;
      const coreMeasured = corePanel.markers
        .map((pm) => pm.marker as MarkerRow)
        .filter((m) => m.resultType === 'MEASURED' && m.defaultUnit !== '');
      const picked = deterministicShuffle(coreMeasured, 'adhoc-report').slice(0, (plan.adHocMarkerCount ?? 12) - 1);
      // hs-CRP is scripted for this report, so it has to be in the set.
      const crp = coreMeasured.find((m) => m.key === 'hs-crp');
      if (crp && !picked.some((m) => m.key === 'hs-crp')) picked[picked.length - 1] = crp;
      markers = [...picked, ...(offPanelCandidates as MarkerRow[])];
    }

    // --- decide a band for every marker -----------------------------------
    const bands = new Map<string, Band>();
    for (const m of markers) {
      if (m.resultType !== 'MEASURED' || m.defaultUnit === '') continue;
      const catalogue = bandByMarkerId.get(m.id);
      if (catalogue) {
        bands.set(m.id, catalogue);
        catalogueRangeMarkers.add(m.key);
      } else {
        bands.set(m.id, syntheticBand(m));
        syntheticRangeMarkers.add(m.key);
      }
    }

    // --- assign statuses by quota ------------------------------------------
    const numericMeasured = markers.filter(
      (m) => m.resultType === 'MEASURED' && m.defaultUnit !== '' && !NARRATIVE[m.key]?.[index],
    );
    const shuffled = deterministicShuffle(numericMeasured, `statuses:${index}`);
    const intended = new Map<string, MarkerStatus>();

    const takeFor = (status: MarkerStatus, count: number, predicate?: (m: MarkerRow) => boolean) => {
      let taken = 0;
      for (const m of shuffled) {
        if (taken >= count) break;
        if (intended.has(m.id)) continue;
        if (predicate && !predicate(m)) continue;
        intended.set(m.id, status);
        taken += 1;
      }
    };
    const below = (m: MarkerRow) => canGoBelow(bands.get(m.id)!, m);
    takeFor('SIGNIFICANT_LOW', plan.quotas.SIGNIFICANT_LOW, below);
    takeFor('LOW', plan.quotas.LOW, below);
    takeFor('SIGNIFICANT_HIGH', plan.quotas.SIGNIFICANT_HIGH);
    takeFor('HIGH', plan.quotas.HIGH);

    // --- build the rows -----------------------------------------------------
    const results: GeneratedResult[] = [];
    for (const m of markers) {
      const scripted = NARRATIVE[m.key]?.[index];
      const r = mulberry32(hash32(`${m.key}:${index}`));

      if (scripted) {
        const low = scripted.low ?? bands.get(m.id)?.low ?? 0;
        const high = scripted.high ?? bands.get(m.id)?.high ?? 0;
        if (typeof scripted.value === 'string') nonNumericResults += 1;
        results.push({
          markerId: m.id,
          markerKey: m.key,
          resultType: m.resultType,
          value: scripted.value,
          unit: m.defaultUnit,
          referenceLow: low,
          referenceHigh: high,
          intendedStatus: null,
        });
        byResultType[m.resultType] += 1;
        continue;
      }

      // Non-measured, and qualitative MEASURED markers the catalogue gives no
      // unit — both report words rather than numbers.
      if (m.resultType !== 'MEASURED') {
        results.push({
          markerId: m.id,
          markerKey: m.key,
          resultType: m.resultType,
          value: nonMeasuredValue(m, index),
          unit: '',
          referenceLow: 0,
          referenceHigh: 0,
          intendedStatus: null,
        });
        byResultType[m.resultType] += 1;
        nonNumericResults += 1;
        continue;
      }

      if (m.defaultUnit === '') {
        results.push({
          markerId: m.id,
          markerKey: m.key,
          resultType: 'MEASURED',
          value: QUALITATIVE_OUTCOMES[Math.floor(r() * QUALITATIVE_OUTCOMES.length)],
          unit: '',
          referenceLow: 0,
          referenceHigh: 0,
          intendedStatus: null,
        });
        byResultType.MEASURED += 1;
        nonNumericResults += 1;
        continue;
      }

      const band = bands.get(m.id)!;
      const status = intended.get(m.id) ?? 'IN_RANGE';

      // Exactly one comparator result in the whole history, on a marker where
      // "< 5.0" is unambiguously inside the band so it reads as a real
      // below-the-limit report rather than an unplaceable value.
      if (!comparatorPlaced && status === 'IN_RANGE' && band.low === 0 && band.high >= 5) {
        comparatorPlaced = true;
        results.push({
          markerId: m.id,
          markerKey: m.key,
          resultType: 'MEASURED',
          value: '< 5.0',
          unit: m.defaultUnit,
          referenceLow: band.low,
          referenceHigh: band.high,
          intendedStatus: null,
        });
        byResultType.MEASURED += 1;
        nonNumericResults += 1;
        continue;
      }

      results.push({
        markerId: m.id,
        markerKey: m.key,
        resultType: 'MEASURED',
        value: valueForStatus(status, band, m, r),
        unit: band.unit || m.defaultUnit,
        referenceLow: band.low,
        referenceHigh: band.high,
        intendedStatus: status,
      });
      byResultType.MEASURED += 1;
      byIntendedStatus[status] += 1;
    }

    for (const res of results) {
      reportsPerMarkerKey.set(res.markerKey, (reportsPerMarkerKey.get(res.markerKey) ?? 0) + 1);
    }

    reports.push({
      panelId: panel?.id ?? null,
      panelKey: panel?.key ?? null,
      panelName: panel?.name ?? null,
      sourceKey: plan.sourceKey,
      sampleDate: sampleDateFor(plan, opts.now),
      demonstrates: plan.demonstrates,
      results,
    });
  }

  // --- diagnostics ----------------------------------------------------------
  const measuredCategories = await prisma.markerCategory.findMany({
    where: { resultType: 'MEASURED' },
    select: { key: true, members: { select: { markerId: true } } },
  });
  const usedMarkerIds = new Set(reports.flatMap((rep) => rep.results.map((res) => res.markerId)));
  const uncovered = measuredCategories.filter((c) => !c.members.some((mm) => usedMarkerIds.has(mm.markerId)));

  const sensitivityKeys = new Set(
    reports.flatMap((rep) => rep.results.filter((r) => r.resultType === 'SENSITIVITY').map((r) => r.markerKey)),
  );
  const groupsCovered = FOOD_SENSITIVITY_GROUPS.filter((g) =>
    g.items.some((food) => sensitivityKeys.has(`${food.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-igg`)),
  ).length;

  const diagnostics: DemoDataDiagnostics = {
    byResultType,
    byIntendedStatus,
    measuredCategoriesCovered: measuredCategories.length - uncovered.length,
    measuredCategoriesTotal: measuredCategories.length,
    uncoveredCategoryKeys: uncovered.map((c) => c.key),
    syntheticRanges: syntheticRangeMarkers.size,
    catalogueRanges: catalogueRangeMarkers.size,
    nonNumericResults,
    markersInOneReportOnly: [...reportsPerMarkerKey.values()].filter((n) => n === 1).length,
    markersInTwoOrMoreReports: [...reportsPerMarkerKey.values()].filter((n) => n >= 2).length,
    foodSensitivityGroups: groupsCovered,
  };

  return { reports, diagnostics };
}
