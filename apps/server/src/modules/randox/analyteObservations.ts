import { prisma } from '../../db/client.js';
import { resolveCatalogueMarkers } from '@aspire-bloods/shared';
import { findBestMarkerMatch, classifyMarkerMatch, type MatchTier } from '../reports/matchMarker.js';
import { analyteIdentity, analyteMappingCoverage, normaliseAnalyte, type AnalyteMatchVia, type LearnedAnalyteMappings } from './analyteMap.js';

/**
 * ---------------------------------------------------------------------------
 * WHAT WE HAVE ACTUALLY SEEN RANDOX SEND, AS OPPOSED TO WHAT WE ASSUME.
 * ---------------------------------------------------------------------------
 *
 * The analyte map bridges Randox's `analyte` string to one of our marker keys,
 * and it was built entirely from our own catalogue: 186 markers resolved from
 * their own names, 0 confirmed against a real Randox payload, and 86 answering
 * to exactly one spelling. That is self-consistency. It is not confirmation,
 * and a single difference in how Randox print any of those 86 costs a result.
 *
 * Refusing to invent plausible Randox spellings to close the gap was the right
 * call and is not revisited here. What this module does instead is make the
 * gap VISIBLE and make it SHRINK from evidence:
 *
 *  · `record()` writes one row per distinct analyte string per delivery,
 *    RESOLVED or UNMAPPED. So "how many mappings have met a real payload" stops
 *    being a hardcoded zero on a report and becomes a number an admin can look
 *    at, derived from deliveries rather than from optimism.
 *  · `queue()` is the UNMAPPED rows, each with the closest catalogue
 *    candidates. Suggestions, labelled as suggestions, never applied.
 *  · `accept()` is a person deciding. It stamps the row `via = 'ADMIN'`, and
 *    from then on it is the learned mapping the ingestion path passes into
 *    `resolveAnalyte`.
 *
 * THE HARDCODED ZERO IN `analyteMappingCoverage()` STAYS EXACTLY AS IT IS.
 * That function answers "what does the code alone claim", and its answer must
 * not creep upward as assumptions accumulate. This module answers a different
 * question — "what has a real payload confirmed" — from a different source,
 * and the two are reported side by side rather than merged.
 */

export interface AnalyteSighting {
  analyte: string | null;
  displayName?: string | null;
  group?: string | null;
  sampleType?: string | null;
  orderNumber?: string | null;
}

/** How a row resolved, or that it did not. */
export type SightingOutcome =
  | { status: 'RESOLVED'; markerKey: string; via: AnalyteMatchVia }
  | { status: 'UNMAPPED' };

/**
 * Record what arrived, once per distinct analyte identity per delivery.
 *
 * NEVER THROWS AND NEVER BLOCKS INGESTION. This is bookkeeping about our own
 * confidence; a result that arrived and resolved must reach the patient's
 * report whether or not we managed to write a row saying we had seen it
 * before. Failures are logged and swallowed, exactly as `recordUnknownCode`
 * does for the same reason.
 */
export async function recordAnalyteSightings(
  sightings: (AnalyteSighting & { outcome: SightingOutcome })[],
): Promise<void> {
  // De-duplicated within one delivery: a panel that reports the same analyte
  // twice is one sighting of that spelling, not two.
  const byIdentity = new Map<string, (typeof sightings)[number]>();
  for (const s of sightings) {
    const name = (s.analyte ?? s.displayName ?? '').trim();
    if (!name) continue;
    byIdentity.set(analyteIdentity(name, s.sampleType), s);
  }

  for (const [identity, s] of byIdentity) {
    const name = (s.analyte ?? s.displayName ?? '').trim();
    try {
      const marker =
        s.outcome.status === 'RESOLVED'
          ? await prisma.marker.findUnique({ where: { key: s.outcome.markerKey }, select: { id: true } })
          : null;

      const existing = await prisma.randoxAnalyteObservation.findUnique({ where: { identity } });

      // A row a human accepted is NOT downgraded by a later automatic pass.
      // `via = 'ADMIN'` is a decision somebody signed; an ingestion run that
      // happens to resolve the same string through the ordinary index has not
      // learned anything that overrules it, and one that fails to resolve it
      // certainly has not.
      const keepDecision = existing?.via === 'ADMIN';

      await prisma.randoxAnalyteObservation.upsert({
        where: { identity },
        create: {
          identity,
          analyte: name,
          normalised: normaliseAnalyte(name),
          sampleType: s.sampleType?.trim() || null,
          group: s.group?.trim() || null,
          displayName: s.displayName?.trim() || null,
          sampleOrderNumber: s.orderNumber?.trim() || null,
          status: s.outcome.status,
          via: s.outcome.status === 'RESOLVED' ? s.outcome.via : null,
          markerId: marker?.id ?? null,
        },
        update: {
          sightings: { increment: 1 },
          lastSeenAt: new Date(),
          group: s.group?.trim() || existing?.group || null,
          displayName: s.displayName?.trim() || existing?.displayName || null,
          sampleOrderNumber: s.orderNumber?.trim() || existing?.sampleOrderNumber || null,
          ...(keepDecision
            ? {}
            : {
                status: s.outcome.status,
                via: s.outcome.status === 'RESOLVED' ? s.outcome.via : null,
                markerId: marker?.id ?? null,
              }),
        },
      });
    } catch (e) {
      console.error(`[randox] could not record analyte sighting for "${name}":`, e);
    }
  }
}

/**
 * The mappings a human has accepted, ready to hand to `resolveAnalyte`.
 *
 * Read per delivery rather than cached — see the note on
 * `LearnedAnalyteMappings`. It is one indexed query returning a handful of
 * rows, against a path that already makes several.
 */
export async function loadLearnedMappings(): Promise<LearnedAnalyteMappings> {
  const rows = await prisma.randoxAnalyteObservation.findMany({
    where: { via: 'ADMIN', markerId: { not: null } },
    select: { identity: true, marker: { select: { key: true, isActive: true } } },
  });
  const out = new Map<string, string>();
  for (const r of rows) {
    // A marker deactivated since somebody accepted the mapping is not a
    // mapping any more. Dropped here rather than in resolveAnalyte, so the row
    // returns to the queue with the ordinary "no marker matched" reason.
    if (r.marker && r.marker.isActive) out.set(r.identity, r.marker.key);
  }
  return out;
}

export interface AnalyteSuggestion {
  markerKey: string;
  markerName: string;
  /** How the fuzzy matcher classifies it. `substring` is the weakest by far. */
  tier: MatchTier;
  /** Plain English, because a tier name is not an explanation. */
  why: string;
}

const TIER_REASON: Record<MatchTier, string> = {
  exact: 'The same name once case and punctuation are removed.',
  rotation: 'The same name with the abbreviation on the other side of it.',
  tokens: 'The same words, in a different order.',
  stem: 'The same word, one of them pluralised or written as a count.',
  substring: 'One name merely contains the other — the weakest kind of match, and the one that confuses Magnesium with RBC Magnesium.',
};

/**
 * The closest catalogue candidates for an unmapped analyte string.
 *
 * THIS IS THE FUZZY MATCHER, DELIBERATELY, and it is the opposite of the rule
 * the analyte map itself follows. `analyteMap.ts` refuses substring and
 * similarity matching outright, because nothing is watching it — a wrong
 * answer there files a real measurement under the wrong analyte on a real
 * patient's record. Here an admin is looking at the answer and has to press a
 * button, so a near-miss costs one glance and a miss costs a result stuck in a
 * queue. Those are not symmetric, and the looser tool is the right one.
 *
 * Ordered strongest tier first, and every suggestion carries its tier so
 * `substring` is visibly the weakest rather than sitting in the list looking
 * like the rest.
 */
export function suggestionsFor(
  analyte: string,
  markers: { id: string; key: string; name: string }[],
  limit = 5,
): AnalyteSuggestion[] {
  const scored: (AnalyteSuggestion & { rank: number })[] = [];
  const ORDER: MatchTier[] = ['exact', 'rotation', 'tokens', 'stem', 'substring'];
  for (const m of markers) {
    const tier = classifyMarkerMatch(analyte, m);
    if (!tier) continue;
    scored.push({ markerKey: m.key, markerName: m.name, tier, why: TIER_REASON[tier], rank: ORDER.indexOf(tier) });
  }
  scored.sort((a, b) => a.rank - b.rank || a.markerName.localeCompare(b.markerName));

  // Nothing classified at all: fall back to the single best-effort match, which
  // uses the same passes but returns a candidate where classify returns null on
  // every one. Better one weak suggestion than an empty list, as long as it is
  // labelled as weak, which the tier does.
  if (scored.length === 0) {
    const best = findBestMarkerMatch(analyte, markers);
    if (best) {
      const tier = classifyMarkerMatch(analyte, best) ?? 'substring';
      return [{ markerKey: best.key, markerName: best.name, tier, why: TIER_REASON[tier] }];
    }
  }
  return scored.slice(0, limit).map(({ rank: _rank, ...s }) => s);
}

export interface QueueEntry {
  id: string;
  analyte: string;
  displayName: string | null;
  group: string | null;
  sampleType: string | null;
  sampleOrderNumber: string | null;
  sightings: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  suggestions: AnalyteSuggestion[];
}

/** The exception queue: analyte strings that arrived and matched nothing. */
export async function unmappedQueue(): Promise<QueueEntry[]> {
  const [rows, markers] = await Promise.all([
    prisma.randoxAnalyteObservation.findMany({
      where: { status: 'UNMAPPED' },
      orderBy: [{ sightings: 'desc' }, { lastSeenAt: 'desc' }],
    }),
    prisma.marker.findMany({ where: { isActive: true }, select: { id: true, key: true, name: true } }),
  ]);

  return rows.map((r) => ({
    id: r.id,
    analyte: r.analyte,
    displayName: r.displayName,
    group: r.group,
    sampleType: r.sampleType,
    sampleOrderNumber: r.sampleOrderNumber,
    sightings: r.sightings,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    suggestions: suggestionsFor(r.displayName ? `${r.analyte}` : r.analyte, markers),
  }));
}

export class AnalyteMappingError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/**
 * A person accepting a mapping. Never automatic, never pre-selected — the
 * marker key arrives in the request because somebody chose it.
 */
export async function acceptMapping(
  observationId: string,
  markerKey: string,
  acceptedById: string,
): Promise<QueueEntry[]> {
  const observation = await prisma.randoxAnalyteObservation.findUnique({ where: { id: observationId } });
  if (!observation) throw new AnalyteMappingError('That analyte is no longer in the queue.', 404);

  const marker = await prisma.marker.findUnique({ where: { key: markerKey }, select: { id: true, isActive: true } });
  if (!marker) throw new AnalyteMappingError(`There is no marker with the key "${markerKey}".`, 400);
  if (!marker.isActive) {
    throw new AnalyteMappingError('That marker has been deactivated, so results cannot be filed against it.', 400);
  }

  await prisma.randoxAnalyteObservation.update({
    where: { id: observationId },
    data: {
      status: 'RESOLVED',
      via: 'ADMIN',
      markerId: marker.id,
      acceptedById,
      acceptedAt: new Date(),
    },
  });

  return unmappedQueue();
}

export interface MappingConfidence {
  /** MEASURED markers in the catalogue — the population the map has to cover. */
  catalogueMeasured: number;
  /**
   * What the CODE alone claims: markers that resolve from their own catalogue
   * name. Self-consistency, and labelled as such wherever it is shown.
   */
  resolvesFromOwnName: number;
  /** Markers answering to exactly one spelling. One difference costs a result. */
  singleSpellingOnly: { key: string; name: string }[];
  /**
   * The hardcoded zero from `analyteMappingCoverage()`, carried through
   * deliberately. It is what the code claims to have confirmed on its own,
   * which is nothing, and it must not drift.
   */
  confirmedByCodeAlone: number;
  /** From evidence: distinct markers a real payload has resolved to. */
  confirmedByRealPayload: number;
  /** Distinct analyte strings seen, and how they went. */
  stringsSeen: number;
  stringsResolved: number;
  stringsUnmapped: number;
  /** Mappings a person accepted from the queue. */
  acceptedByAdmin: number;
  lastSeenAt: Date | null;
}

/**
 * The number an admin looks at.
 *
 * Two figures side by side, never added together: what the code claims, and
 * what a delivery has proved. Before the first real payload the second is 0
 * and the screen says so in words rather than showing an empty state that
 * reads like a page that failed to load.
 */
export async function mappingConfidence(): Promise<MappingConfidence> {
  const coverage = analyteMappingCoverage();
  const [distinctMarkers, resolved, unmapped, accepted, latest] = await Promise.all([
    prisma.randoxAnalyteObservation.findMany({
      where: { status: 'RESOLVED', markerId: { not: null } },
      distinct: ['markerId'],
      select: { markerId: true },
    }),
    prisma.randoxAnalyteObservation.count({ where: { status: 'RESOLVED' } }),
    prisma.randoxAnalyteObservation.count({ where: { status: 'UNMAPPED' } }),
    prisma.randoxAnalyteObservation.count({ where: { via: 'ADMIN' } }),
    prisma.randoxAnalyteObservation.findFirst({ orderBy: { lastSeenAt: 'desc' }, select: { lastSeenAt: true } }),
  ]);

  return {
    catalogueMeasured: coverage.measured,
    resolvesFromOwnName: coverage.resolvesFromOwnName,
    singleSpellingOnly: coverage.singleSpellingOnly,
    confirmedByCodeAlone: coverage.confirmedAgainstRealPayload,
    confirmedByRealPayload: distinctMarkers.length,
    stringsSeen: resolved + unmapped,
    stringsResolved: resolved,
    stringsUnmapped: unmapped,
    acceptedByAdmin: accepted,
    lastSeenAt: latest?.lastSeenAt ?? null,
  };
}

/** Active MEASURED markers, for the accept picker. */
export async function markersForMapping(): Promise<{ key: string; name: string }[]> {
  const catalogue = new Set(resolveCatalogueMarkers().map((m) => m.key));
  const markers = await prisma.marker.findMany({
    where: { isActive: true },
    select: { key: true, name: true },
    orderBy: { name: 'asc' },
  });
  // Catalogue markers first, then anything else still active — an admin should
  // be able to file against a marker that predates the Randox catalogue, but
  // should not have to scroll past it to find the ordinary one.
  return [...markers.filter((m) => catalogue.has(m.key)), ...markers.filter((m) => !catalogue.has(m.key))];
}
