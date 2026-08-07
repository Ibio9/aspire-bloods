/**
 * Seeds the real Randox catalogue: three panels, 43 health areas, and every
 * analyte across all four result types.
 *
 * The data lives in @aspire-bloods/shared (markerCatalogue.ts) because the web
 * app needs the same category names and the same result-type rules to render a
 * report. This module is only the write path, plus the one thing a data import
 * of this size genuinely needs: a report of what it decided.
 *
 * Three rules it follows and one it refuses:
 *
 *  - Nothing is overwritten. An analyte already in the catalogue keeps its
 *    name, its unit and its severity settings; the import only ever ADDS to it
 *    (result type, aliases, a Randox code, category memberships). A seed that
 *    rewrote a marker's unit would silently reinterpret every historical result
 *    filed against it.
 *  - Nothing is deleted. Markers no longer offered are not touched here at all
 *    — deactivation is a deliberate admin action, not a side effect of an
 *    import (see EXCLUDED_MARKER_KEYS in seed.ts for the one exception, which
 *    deactivates rather than deletes).
 *  - Deduplication inside the new catalogue is by explicit key, decided in
 *    markerCatalogue.ts. Fuzzy matching is used only to reconcile the new
 *    catalogue against what was already there.
 *
 *  - It refuses to merge on a substring match. See classifyMarkerMatch: those
 *    are reported for a human instead, because "Magnesium" is a substring of
 *    "RBC Magnesium" and merging those two would file red-cell magnesium
 *    results under a serum magnesium marker for ever.
 */
import { readFileSync } from 'node:fs';
import { prisma } from '../src/db/client.js';
import {
  ALL_CATEGORIES,
  CATALOGUE_PANELS,
  GP3_NESTING,
  markerKeyForName,
  markerKeysForPanel,
  resolveCatalogueMarkers,
  type CatalogueMarker,
} from '@aspire-bloods/shared';
import { classifyMarkerMatch, findBestMarkerMatch, STRONG_MATCH_TIERS } from '../src/modules/reports/matchMarker.js';

export interface CatalogueSeedReport {
  created: Record<string, number>;
  updated: number;
  /** Already in the catalogue under the same key — no matching needed. */
  matchedByKey: number;
  merged: { catalogueName: string; intoKey: string; intoName: string; tier: string }[];
  suggestedNotMerged: { catalogueName: string; wouldMatchKey: string; wouldMatchName: string }[];
  withRandoxCode: string[];
  withoutRandoxCode: string[];
  categoriesCreated: number;
  membershipsCreated: number;
  panels: { key: string; markerCount: number; includes: string[]; confirmed: boolean }[];
  measuredWithoutUnit: string[];
}

/**
 * Our Marker.key → Randox's individual test id, read from the same id-map file
 * the ordering path uses (config/randox/id-map.json, RANDOX_ID_MAP_FILE). That
 * file is the single place a Randox identifier is allowed to live; duplicating
 * the codes into the seed would give us two sources for one fact and no way to
 * tell which one an order actually used.
 */
function loadRandoxTestCodes(): Record<string, string> {
  const path = process.env.RANDOX_ID_MAP_FILE ?? 'config/randox/id-map.json';
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { tests?: Record<string, string> };
    return raw.tests ?? {};
  } catch {
    // No id map on this deployment yet. Every marker is then reported as
    // having no code, which is the truth rather than a failure.
    return {};
  }
}

export async function seedRandoxCatalogue(): Promise<CatalogueSeedReport> {
  const catalogue = resolveCatalogueMarkers();
  const codes = loadRandoxTestCodes();

  const report: CatalogueSeedReport = {
    created: { MEASURED: 0, GENETIC: 0, SENSITIVITY: 0, COMPOSITION: 0 },
    updated: 0,
    matchedByKey: 0,
    merged: [],
    suggestedNotMerged: [],
    withRandoxCode: [],
    withoutRandoxCode: [],
    categoriesCreated: 0,
    membershipsCreated: 0,
    panels: [],
    measuredWithoutUnit: [],
  };

  // The catalogue as it stood BEFORE this run. Matching against a snapshot
  // rather than a live query is what stops a marker created earlier in this
  // same loop from being fuzzy-matched by a later one.
  const preExisting = await prisma.marker.findMany({ select: { id: true, key: true, name: true } });
  const preExistingByKey = new Map(preExisting.map((m) => [m.key, m]));

  /** catalogue key → the Marker.id it actually resolved to (its own, or the one it merged into). */
  const resolvedId = new Map<string, string>();

  for (const m of catalogue) {
    const direct = preExistingByKey.get(m.key);
    let targetId: string | null = direct?.id ?? null;
    let mergedInto: { key: string; name: string } | null = null;
    if (direct) report.matchedByKey += 1;

    if (!targetId) {
      // Try every name this analyte is known by, not just its primary one —
      // the catalogue holds "ALT (Alanine Aminotransferase)" where Randox
      // write "Alanine Aminotransferase (ALT)", and either spelling should
      // find it.
      for (const candidateName of [m.name, ...m.aliases]) {
        const hit = findBestMarkerMatch(candidateName, preExisting);
        if (!hit) continue;
        const tier = classifyMarkerMatch(candidateName, hit);
        if (tier && STRONG_MATCH_TIERS.includes(tier)) {
          targetId = hit.id;
          mergedInto = { key: hit.key, name: hit.name };
          report.merged.push({ catalogueName: m.name, intoKey: hit.key, intoName: hit.name, tier });
          break;
        }
        if (tier === 'substring') {
          report.suggestedNotMerged.push({
            catalogueName: m.name,
            wouldMatchKey: hit.key,
            wouldMatchName: hit.name,
          });
        }
      }
    }

    const code = codes[m.key];
    if (code) report.withRandoxCode.push(m.key);
    else report.withoutRandoxCode.push(m.key);
    if (m.resultType === 'MEASURED' && !m.unit) report.measuredWithoutUnit.push(m.key);

    if (targetId) {
      // Additive only. Name, defaultUnit, severityMultiplier and isActive are
      // whatever the catalogue already says they are.
      const existing = await prisma.marker.findUnique({ where: { id: targetId }, select: { aliases: true } });
      const aliases = new Set([...(existing?.aliases ?? []), ...m.aliases]);
      if (mergedInto) aliases.add(m.name);
      await prisma.marker.update({
        where: { id: targetId },
        data: {
          resultType: m.resultType,
          aliases: [...aliases].sort(),
          ...(code ? { randoxCode: code } : {}),
        },
      });
      report.updated += 1;
    } else {
      const created = await prisma.marker.create({
        data: {
          key: m.key,
          name: m.name,
          defaultUnit: m.unit,
          resultType: m.resultType,
          aliases: [...new Set(m.aliases)].sort(),
          ...(code ? { randoxCode: code } : {}),
        },
      });
      targetId = created.id;
      report.created[m.resultType] += 1;
    }

    resolvedId.set(m.key, targetId);
  }

  // --- Categories and memberships -----------------------------------------

  for (const [i, c] of ALL_CATEGORIES.entries()) {
    const category = await prisma.markerCategory.upsert({
      where: { key: c.key },
      update: { name: c.name, randoxId: c.randoxId, resultType: c.resultType, note: c.note ?? null, sortOrder: i },
      create: {
        key: c.key,
        name: c.name,
        randoxId: c.randoxId,
        resultType: c.resultType,
        note: c.note ?? null,
        sortOrder: i,
      },
    });
    report.categoriesCreated += 1;

    for (const [j, name] of c.markerNames.entries()) {
      const markerId = resolvedId.get(markerKeyForName(name));
      if (!markerId) continue;
      await prisma.markerCategoryMembership.upsert({
        where: { markerId_categoryId: { markerId, categoryId: category.id } },
        update: { sortOrder: j },
        create: { markerId, categoryId: category.id, sortOrder: j },
      });
      report.membershipsCreated += 1;
    }
  }

  // --- Panels --------------------------------------------------------------

  for (const p of CATALOGUE_PANELS) {
    const panel = await prisma.panel.upsert({
      where: { key: p.key },
      update: {
        name: p.name,
        description: p.description,
        includesPanelKeys: [...p.includes],
        turnaroundWorkingDays: p.turnaroundWorkingDays,
        turnaroundNote: p.turnaroundNote ?? null,
        repeatIntervalMonths: p.repeatIntervalMonths ?? null,
      },
      create: {
        key: p.key,
        name: p.name,
        description: p.description,
        includesPanelKeys: [...p.includes],
        turnaroundWorkingDays: p.turnaroundWorkingDays,
        turnaroundNote: p.turnaroundNote ?? null,
        repeatIntervalMonths: p.repeatIntervalMonths ?? null,
        // Left as the catalogue declares it. Core stays false because the tiers
        // above Basic Screen could not be checked against Randox's own
        // catalogue document — see GP3_NESTING's provenance warning.
        compositionConfirmed: p.compositionConfirmed,
      },
    });

    const keys = markerKeysForPanel(p);
    for (const [i, key] of keys.entries()) {
      const markerId = resolvedId.get(key);
      if (!markerId) continue;
      await prisma.panelMarker.upsert({
        where: { panelId_markerId: { panelId: panel.id, markerId } },
        update: { sortOrder: i },
        create: { panelId: panel.id, markerId, sortOrder: i },
      });
    }

    report.panels.push({
      key: p.key,
      markerCount: keys.length,
      includes: [...p.includes],
      confirmed: p.compositionConfirmed,
    });
  }

  return report;
}

/** Human-readable, printed at the end of a seed run. */
export function formatCatalogueReport(r: CatalogueSeedReport): string {
  const lines: string[] = [];
  const total = Object.values(r.created).reduce((a, b) => a + b, 0);

  lines.push('');
  lines.push('─── Randox catalogue import ' + '─'.repeat(44));
  lines.push('');
  lines.push('Markers created, by result type:');
  for (const [type, n] of Object.entries(r.created)) lines.push(`  ${type.padEnd(12)} ${n}`);
  lines.push(`  ${'TOTAL'.padEnd(12)} ${total} created, ${r.updated} existing records extended`);
  lines.push('');

  lines.push('Reconciled against the existing catalogue:');
  lines.push(`  ${r.matchedByKey} matched on key — the analyte was already there under a name we hold`);
  lines.push(`  ${r.merged.length} merged on a name match`);
  for (const m of r.merged) lines.push(`    "${m.catalogueName}" → ${m.intoKey} ("${m.intoName}") [${m.tier}]`);
  lines.push('');

  if (r.suggestedNotMerged.length > 0) {
    lines.push(`Possible matches NOT merged — substring only, needs a human: ${r.suggestedNotMerged.length}`);
    for (const s of r.suggestedNotMerged) {
      lines.push(`  "${s.catalogueName}" ~ ${s.wouldMatchKey} ("${s.wouldMatchName}") — kept separate`);
    }
    lines.push('');
  }

  lines.push(`Randox product code: ${r.withRandoxCode.length} mapped, ${r.withoutRandoxCode.length} unmapped`);
  if (r.withoutRandoxCode.length > 0) {
    lines.push('  Unmapped markers cannot be ordered individually until the id map is filled in.');
    lines.push(`  First 20: ${r.withoutRandoxCode.slice(0, 20).join(', ')}`);
  }
  lines.push('');

  lines.push(`Health areas: ${r.categoriesCreated}, memberships: ${r.membershipsCreated}`);
  lines.push('');
  lines.push('Panels:');
  for (const p of r.panels) {
    const nesting = p.includes.length ? ` (includes ${p.includes.join(' ← ')})` : '';
    lines.push(`  ${p.key.padEnd(14)} ${String(p.markerCount).padStart(3)} markers${nesting}${p.confirmed ? '' : '  [composition UNCONFIRMED]'}`);
  }
  lines.push('');
  lines.push('Advanced GP3 nesting, innermost first:');
  for (const t of GP3_NESTING) {
    lines.push(
      `  ${t.name.padEnd(21)} ${(t.code ?? '—').padEnd(9)}  adds ${String(t.addsMarkerNames.length).padStart(2)}  ${t.sourced ? 'sourced from the HSC5 example report' : 'UNCONFIRMED — catalogue PDF unavailable'}`,
    );
  }
  lines.push('');

  if (r.measuredWithoutUnit.length > 0) {
    lines.push(`MEASURED markers with no unit (qualitative results): ${r.measuredWithoutUnit.length}`);
    lines.push(`  ${r.measuredWithoutUnit.join(', ')}`);
    lines.push('');
  }

  lines.push('─'.repeat(72));
  return lines.join('\n');
}
