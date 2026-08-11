import { describe, it, expect } from 'vitest';
import {
  ALL_CATEGORIES,
  CATALOGUE_PANELS,
  RESULT_TYPE_RULES,
  catalogueSummary,
  categoriesFor,
  markerKeyForName,
  markerKeysForPanel,
  resolveCatalogueMarkers,
  type ResultType,
} from '@aspire-bloods/shared';

/**
 * THE PANEL SET DIFF, and it covers every panel rather than a sample.
 *
 * The seed itself now throws on an unresolved panel key (see seedCatalogue.ts),
 * but a seed only runs against a database and only in an environment where one
 * is up. These are the same assertions with neither requirement, so a change to
 * the catalogue fails in `npm test` rather than at deploy time.
 *
 * The defect they were written for: `markerKeysForPanel` resolved every panel's
 * categories against ALL_CATEGORIES, which is `categoriesFor('signature')` —
 * the FULLEST definition of each one. Insight 360 therefore came out carrying
 * ten markers Signature adds and Insight does not sell, an ECG among them.
 * Nothing anywhere said so: the panel simply had more rows in it than the
 * product does.
 */

const catalogue = resolveCatalogueMarkers();
const byKey = new Map(catalogue.map((m) => [m.key, m]));

function typeCounts(keys: string[]): Record<ResultType, number> {
  const out: Record<ResultType, number> = {
    MEASURED: 0, GENETIC: 0, SENSITIVITY: 0, COMPOSITION: 0, QUALITATIVE: 0,
  };
  for (const k of keys) {
    const m = byKey.get(k);
    if (m) out[m.resultType] += 1;
  }
  return out;
}

describe.each(CATALOGUE_PANELS.map((p) => [p.key, p] as const))('%s', (_key, panel) => {
  const keys = markerKeysForPanel(panel);

  it('resolves every marker key it claims', () => {
    const unresolved = keys.filter((k) => !byKey.has(k));
    expect(unresolved, `${panel.key} claims marker keys the catalogue cannot answer`).toEqual([]);
  });

  it('claims every marker in every category it lists', () => {
    // The other direction. A category the panel lists but whose members did not
    // reach the key set means markerKeysForPanel silently dropped something.
    const level = panel.categoryLevel;
    if (!level) {
      expect(panel.categoryKeys).toEqual([]);
      return;
    }
    const byCategoryKey = new Map(categoriesFor(level).map((c) => [c.key, c]));
    const expected = new Set(
      panel.categoryKeys.flatMap((ck) => (byCategoryKey.get(ck)?.markerNames ?? []).map(markerKeyForName)),
    );
    for (const n of panel.extraMarkerNames ?? []) expected.add(markerKeyForName(n));
    expect([...expected].filter((k) => !keys.includes(k)).sort()).toEqual([]);
  });

  it('has no duplicate keys', () => {
    expect(keys.length).toBe(new Set(keys).size);
  });
});

describe('the three panels together', () => {
  it('resolves Insight 360 at its own level, not Signature’s', () => {
    const insight = CATALOGUE_PANELS.find((p) => p.key === 'insight-360')!;
    const signature = CATALOGUE_PANELS.find((p) => p.key === 'signature')!;
    const insightKeys = new Set(markerKeysForPanel(insight));
    const signatureKeys = new Set(markerKeysForPanel(signature));

    // Signature is Insight plus its own additions, so containment holds...
    expect([...insightKeys].filter((k) => !signatureKeys.has(k))).toEqual([]);

    // ...and the additions are genuinely absent from Insight. These ten are
    // exactly what SIGNATURE_CATEGORY_ADDITIONS adds to four Insight
    // categories, and every one of them used to be on Insight 360 as well.
    for (const key of [
      'ecg', 'troponin-i', 'troponin-t', 'd-dimer', 'ana', 'anti-ttg',
      'gastric-parietal-cell-antibodies', 'intrinsic-factor-antibodies',
      'genetic-coeliac-disease', 'genetic-lactose-intolerance', 'ttg-iga',
    ]) {
      expect(insightKeys.has(key), `${key} is on Insight 360 and should not be`).toBe(false);
      expect(signatureKeys.has(key), `${key} is missing from Signature`).toBe(true);
    }
  });

  it('sells every marker in the catalogue on at least one panel', () => {
    // The reverse set diff. A marker the catalogue holds and no panel offers is
    // a test nobody can order and a row nobody will ever fill — either a
    // transcription that landed in no category, or a panel composition that
    // lost one. Currently none: AMH and the Omega-3 Index reach a panel only
    // through Core's `extraMarkerNames`, which is exactly what that field is
    // for.
    const onAPanel = new Set(CATALOGUE_PANELS.flatMap((p) => markerKeysForPanel(p)));
    expect(catalogue.filter((m) => !onAPanel.has(m.key)).map((m) => m.key).sort()).toEqual([]);
  });

  it('files every category’s markers under a result type that matches the category', () => {
    // A COMPOSITION marker inside a MEASURED health area, or the reverse, is
    // how a bacterium ends up in the counts strip.
    for (const c of ALL_CATEGORIES) {
      for (const name of c.markerNames) {
        const m = byKey.get(markerKeyForName(name));
        if (!m) continue;
        // RESULT_TYPE_OVERRIDES is the deliberate exception and is small enough
        // to enumerate: two genetic indicators and three qualitative ones,
        // each inside an otherwise-measured area.
        const overridden = ['genetic-coeliac-disease', 'genetic-lactose-intolerance', 'ecg', 'body-composition-analyser', 'prostate-cancer-risk-score'];
        if (overridden.includes(m.key)) continue;
        expect(m.resultType, `${m.key} is ${m.resultType} inside ${c.key}, which is ${c.resultType}`).toBe(c.resultType);
      }
    }
  });
});

/**
 * THE COUNTS, per panel and per result type, written down.
 *
 * Not a vanity check: they are the numbers reported to the clinic, and a change
 * to the catalogue that moves one of them should be a change somebody made on
 * purpose. The MEASURED figure is the one that matters most, because it is the
 * population the at-a-glance strip, the category bars and Trends draw from.
 */
describe('catalogue counts', () => {
  it('holds 435 markers across five result types', () => {
    const s = catalogueSummary();
    expect(s.markerCount).toBe(435);
    expect(s.byResultType).toEqual({
      MEASURED: 164, GENETIC: 32, SENSITIVITY: 207, COMPOSITION: 10, QUALITATIVE: 22,
    });
  });

  it('leaves exactly nine MEASURED markers without a unit, and names them', () => {
    // Every one is a real laboratory measurement reported in words rather than
    // numbers — the H. pylori serology and the eight urinalysis dipstick pads.
    // (`ph-urine` is the ninth pad and is genuinely numeric, so it has a unit.)
    // A unit is never invented to clear this list; see the note above UNITS.
    expect(catalogueSummary().measuredWithoutUnit.sort()).toEqual([
      'bilirubin-urine', 'glucose-urine', 'h-pylori', 'ketones-urine', 'nitrite-urine',
      'protein-urine', 'red-blood-cells-urine', 'urobilinogen-urine', 'white-blood-cells-urine',
    ]);
  });

  it('breaks each panel down by result type', () => {
    const counts = Object.fromEntries(CATALOGUE_PANELS.map((p) => [p.key, typeCounts(markerKeysForPanel(p))]));
    expect(counts).toEqual({
      core: { MEASURED: 70, GENETIC: 0, SENSITIVITY: 0, COMPOSITION: 0, QUALITATIVE: 0 },
      // The two QUALITATIVE ones are the body composition analyser and the
      // prostate cancer risk score, which sit inside Insight's own health
      // areas. The nineteen UTI entries are Signature-only, which is why they
      // do not appear here.
      'insight-360': { MEASURED: 150, GENETIC: 0, SENSITIVITY: 0, COMPOSITION: 0, QUALITATIVE: 2 },
      signature: { MEASURED: 162, GENETIC: 32, SENSITIVITY: 207, COMPOSITION: 10, QUALITATIVE: 22 },
    });
  });

  it('keeps Insight 360 honestly short of its published figure', () => {
    // Randox market Insight 360 as "around 250 data points". The enumerated
    // categories come to fewer than that, and the catalogue seeds the
    // enumeration rather than the headline — a list is more specific than a
    // count. This test exists so the gap stays visible instead of being
    // rounded away; if a future transcription closes it, the number here
    // changes deliberately.
    const insight = markerKeysForPanel(CATALOGUE_PANELS.find((p) => p.key === 'insight-360')!);
    expect(insight.length).toBe(152);
    expect(insight.length).toBeLessThan(250);
  });

  /**
   * THE TWO DISCREPANCIES ARE TWO PROBLEMS, AND REASSIGNMENT CANNOT FIX EITHER.
   *
   * Insight is 98 short of its published ~250 and Signature is 83 over its
   * published ~350. Those nearly cancel, which is what made "one misfiling
   * explains both" the obvious hypothesis — and the `categoryLevel` defect the
   * obvious cause. This pins the arithmetic that rules it out, so the question
   * is not re-opened from the counts alone. The note above CATALOGUE_PANELS
   * has the reasoning.
   */
  it('cannot reconcile either panel with its published size by moving markers', () => {
    const insight = CATALOGUE_PANELS.find((p) => p.key === 'insight-360')!;
    const signature = CATALOGUE_PANELS.find((p) => p.key === 'signature')!;
    const insightKeys = new Set(markerKeysForPanel(insight));
    const signatureKeys = markerKeysForPanel(signature);

    expect(insightKeys.size).toBe(152);
    expect(signatureKeys.length).toBe(433);

    // SIGNATURE CONTAINS INSIGHT BY CONSTRUCTION, so a marker moved out of
    // "Signature only" and into Insight is a marker Signature still has.
    // Reassignment is structurally incapable of subtracting from Signature's
    // 433, whatever it does to Insight's 152.
    expect([...insightKeys].filter((k) => !signatureKeys.includes(k))).toEqual([]);

    // And of the 281 Signature holds that Insight does not, only these eleven
    // are even candidates — the rest are in categories Insight does not list.
    // Every one of the eleven is named in Signature's own description as what
    // Signature adds, so moving them would contradict the product copy; and it
    // would close 11 of the 98 in any case.
    const signatureOnly = signatureKeys.filter((k) => !insightKeys.has(k));
    expect(signatureOnly.length).toBe(281);
    const byCategory = new Map(categoriesFor('signature').map((c) => [c.key, c]));
    const inAnInsightArea = new Set(
      insight.categoryKeys.flatMap((ck) =>
        (byCategory.get(ck)?.markerNames ?? []).map(markerKeyForName).filter((k) => !insightKeys.has(k)),
      ),
    );
    expect([...inAnInsightArea].sort()).toEqual(
      [
        'ana', 'anti-ttg', 'd-dimer', 'ecg', 'gastric-parietal-cell-antibodies',
        'genetic-coeliac-disease', 'genetic-lactose-intolerance',
        'intrinsic-factor-antibodies', 'troponin-i', 'troponin-t', 'ttg-iga',
      ].sort(),
    );
    expect(insightKeys.size + inAnInsightArea.size).toBeLessThan(250);

    // What is left is a counting unit, not a membership question: 207 of
    // Signature's 433 are food-sensitivity IgG items, and Signature without
    // them is UNDER the published figure rather than over it. Randox's "data
    // points" is not our "markers", and that is a question for Randox.
    const sensitivity = signatureKeys.filter((k) => byKey.get(k)?.resultType === 'SENSITIVITY').length;
    expect(sensitivity).toBe(207);
    expect(signatureKeys.length - sensitivity).toBeLessThan(350);
  });

  it('gives only MEASURED a reference range, a trend and a place in the grid', () => {
    for (const [type, rules] of Object.entries(RESULT_TYPE_RULES)) {
      const measured = type === 'MEASURED';
      expect(rules.inMainGrid, type).toBe(measured);
      expect(rules.hasReferenceRange, type).toBe(measured);
      expect(rules.trendable, type).toBe(measured);
      expect(rules.canHaveOptimalRange, type).toBe(measured);
      // Everything else has to say what it is before a patient reads it.
      expect(measured ? rules.framing === '' : rules.framing.length > 80, type).toBe(true);
    }
  });
});
