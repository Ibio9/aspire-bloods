import type { Prisma, RandoxCatalogueKind } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { nexusLabClient } from './clients/index.js';
import { isRandoxEnabled } from './config.js';

/**
 * Randox's own reference data, fetched and cached rather than hardcoded.
 *
 * Nexus publishes seven self-serve endpoints — GetPanels, GetTests,
 * GetMyClinicDetails, GetBiologicalSex, GetEthnicity, GetTestingReasons,
 * GetCancellationReasons — and every one of them is the authority on values
 * our own config would otherwise have to guess at. Our marker and panel
 * catalogue was seeded from a pricing email, so divergence from what Randox
 * will actually accept is expected, not hypothetical.
 *
 * Caching rather than calling per request: none of this changes more than
 * occasionally, and an ordering flow that makes seven extra API calls
 * before it can render a form is a flow that fails whenever Randox are
 * slow.
 *
 * Rows Randox stop returning are marked isCurrent=false rather than
 * deleted. An order placed last month against a panel they have since
 * withdrawn still has to be explainable.
 */

export interface RefreshSummary {
  kind: RandoxCatalogueKind;
  fetched: number;
  added: number;
  updated: number;
  retired: number;
}

async function upsertKind(
  kind: RandoxCatalogueKind,
  items: { randoxId: string; name: string; code?: string | null; payload?: unknown }[],
): Promise<RefreshSummary> {
  const now = new Date();
  const existing = await prisma.randoxCatalogueEntry.findMany({ where: { kind } });
  const existingById = new Map(existing.map((e) => [e.randoxId, e]));

  let added = 0;
  let updated = 0;

  for (const item of items) {
    if (!item.randoxId) continue;
    const prior = existingById.get(item.randoxId);
    if (prior) updated += 1;
    else added += 1;

    await prisma.randoxCatalogueEntry.upsert({
      where: { kind_randoxId: { kind, randoxId: item.randoxId } },
      create: {
        kind,
        randoxId: item.randoxId,
        name: item.name,
        code: item.code ?? null,
        payload: (item.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        lastSeenAt: now,
      },
      update: {
        name: item.name,
        code: item.code ?? null,
        payload: (item.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        // A row Randox have started returning again is current again.
        isCurrent: true,
        lastSeenAt: now,
        // mappedKey is deliberately NOT touched. An admin's mapping decision
        // survives every refresh — re-deriving it from a name match on each
        // sync would silently undo a correction someone made by hand.
      },
    });
  }

  const seen = new Set(items.map((i) => i.randoxId));
  const retiredIds = existing.filter((e) => e.isCurrent && !seen.has(e.randoxId)).map((e) => e.randoxId);
  if (retiredIds.length > 0) {
    await prisma.randoxCatalogueEntry.updateMany({
      where: { kind, randoxId: { in: retiredIds } },
      data: { isCurrent: false },
    });
  }

  return { kind, fetched: items.length, added, updated, retired: retiredIds.length };
}

/**
 * Pulls everything. Each kind is fetched independently so one failing
 * endpoint doesn't lose the other six — the failure is thrown at the end
 * with the list of what broke, after the successful kinds have been saved.
 */
export async function refreshReferenceData(actorUserId: string | null): Promise<RefreshSummary[]> {
  if (!isRandoxEnabled()) {
    throw new Error('The Randox integration is switched off (RANDOX_ENABLED=false).');
  }

  const client = nexusLabClient();
  const summaries: RefreshSummary[] = [];
  const failures: string[] = [];

  const run = async (label: string, fn: () => Promise<RefreshSummary>) => {
    try {
      summaries.push(await fn());
    } catch (e) {
      failures.push(`${label}: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  await run('GetPanels', async () =>
    upsertKind(
      'PANEL',
      (await client.getPanels()).map((p) => ({ randoxId: p.id, name: p.name, code: p.code, payload: p })),
    ),
  );
  await run('GetTests', async () =>
    upsertKind(
      'TEST',
      (await client.getTests()).map((t) => ({ randoxId: t.id, name: t.name, code: t.code, payload: t })),
    ),
  );
  await run('GetBiologicalSex', async () =>
    upsertKind('BIOLOGICAL_SEX', (await client.getBiologicalSexes()).map((i) => ({ randoxId: i.id, name: i.name }))),
  );
  await run('GetEthnicity', async () =>
    upsertKind('ETHNICITY', (await client.getEthnicities()).map((i) => ({ randoxId: i.id, name: i.name }))),
  );
  await run('GetTestingReasons', async () =>
    upsertKind('TESTING_REASON', (await client.getTestingReasons()).map((i) => ({ randoxId: i.id, name: i.name }))),
  );
  await run('GetCancellationReasons', async () =>
    upsertKind(
      'CANCELLATION_REASON',
      (await client.getCancellationReasons()).map((i) => ({ randoxId: i.id, name: i.name })),
    ),
  );
  await run('GetMyClinicDetails', async () => {
    const clinic = await client.getMyClinicDetails();
    // The clinic itself and each of its test locations are both orderable
    // targets — TestClinicLocationId can be either, depending on how many
    // sites the clinic has.
    const locations = [clinic, ...clinic.clinicTestLocations].map((l) => ({
      randoxId: l.id,
      name: l.name,
      code: l.code,
      payload: l,
    }));
    return upsertKind('CLINIC_LOCATION', locations);
  });

  await recordAuditLog({
    actorUserId,
    actorType: actorUserId ? 'USER' : 'SYSTEM',
    action: 'RANDOX_REFERENCE_DATA_REFRESHED',
    targetType: 'RandoxCatalogueEntry',
    metadata: { summaries: summaries as unknown as Prisma.InputJsonValue, failures },
  });

  if (failures.length > 0) {
    throw new Error(`Refreshed ${summaries.length} of 7 reference sets. Failed: ${failures.join('; ')}`);
  }

  return summaries;
}

/** True when the cache has never been populated or has gone stale. */
export async function isReferenceDataStale(): Promise<boolean> {
  const newest = await prisma.randoxCatalogueEntry.findFirst({ orderBy: { lastSeenAt: 'desc' }, select: { lastSeenAt: true } });
  if (!newest) return true;
  return Date.now() - newest.lastSeenAt.getTime() > env.RANDOX_REFERENCE_DATA_TTL_MINUTES * 60_000;
}

export async function listCatalogue(kind: RandoxCatalogueKind) {
  return prisma.randoxCatalogueEntry.findMany({ where: { kind }, orderBy: [{ isCurrent: 'desc' }, { name: 'asc' }] });
}

/** Our catalogue key for a Randox id, or null when nobody has mapped it. */
export async function mappedKeyFor(kind: RandoxCatalogueKind, randoxId: string): Promise<string | null> {
  const entry = await prisma.randoxCatalogueEntry.findUnique({ where: { kind_randoxId: { kind, randoxId } } });
  return entry?.mappedKey ?? null;
}

/**
 * The reconciliation an admin actually needs: Randox's live list beside
 * ours, with everything that doesn't line up called out.
 *
 * Three distinct problems, deliberately reported separately rather than as
 * one "mismatch" count, because the fix differs for each:
 *
 *   unmappedRandox   Randox offer it, we haven't said what it is.
 *                    Cannot be ordered until mapped.
 *   unmappedOurs     We list it in our catalogue with no Randox equivalent.
 *                    Either it's Aspire in-house, or it was in the pricing
 *                    email and Randox don't actually sell it.
 *   retired          We had it mapped and Randox have stopped returning it.
 *                    Existing reports keep working; new orders will fail.
 */
export async function catalogueReconciliation() {
  const [randoxPanels, randoxTests, ourPanels, ourMarkers] = await Promise.all([
    prisma.randoxCatalogueEntry.findMany({ where: { kind: 'PANEL' } }),
    prisma.randoxCatalogueEntry.findMany({ where: { kind: 'TEST' } }),
    prisma.panel.findMany({ where: { isActive: true }, select: { key: true, name: true } }),
    prisma.marker.findMany({ where: { isActive: true }, select: { key: true, name: true } }),
  ]);

  const build = (
    randoxEntries: typeof randoxPanels,
    ours: { key: string; name: string }[],
    label: 'panel' | 'test',
  ) => {
    const mappedKeys = new Set(randoxEntries.filter((e) => e.mappedKey).map((e) => e.mappedKey!));
    return {
      label,
      randoxTotal: randoxEntries.filter((e) => e.isCurrent).length,
      ourTotal: ours.length,
      mapped: randoxEntries.filter((e) => e.isCurrent && e.mappedKey).length,
      unmappedRandox: randoxEntries
        .filter((e) => e.isCurrent && !e.mappedKey)
        .map((e) => ({ randoxId: e.randoxId, name: e.name, code: e.code })),
      unmappedOurs: ours.filter((o) => !mappedKeys.has(o.key)).map((o) => ({ key: o.key, name: o.name })),
      retired: randoxEntries
        .filter((e) => !e.isCurrent && e.mappedKey)
        .map((e) => ({ randoxId: e.randoxId, name: e.name, mappedKey: e.mappedKey })),
    };
  };

  return {
    stale: await isReferenceDataStale(),
    lastRefreshedAt:
      (await prisma.randoxCatalogueEntry.findFirst({ orderBy: { lastSeenAt: 'desc' }, select: { lastSeenAt: true } }))
        ?.lastSeenAt ?? null,
    panels: build(randoxPanels, ourPanels, 'panel'),
    tests: build(randoxTests, ourMarkers, 'test'),
  };
}

/**
 * Records an admin's decision that a Randox entry corresponds to one of
 * ours. Setting mappedKey to null unmaps it again.
 *
 * Nothing here is automatic. A name match between "01 LIPIDS" and our
 * "Lipid Profile" is suggestive, not conclusive, and a wrong panel mapping
 * means ordering the wrong tests for a real patient.
 */
export async function setCatalogueMapping(
  id: string,
  mappedKey: string | null,
  actorUserId: string,
  ip: string | null,
): Promise<void> {
  const entry = await prisma.randoxCatalogueEntry.findUnique({ where: { id } });
  if (!entry) throw new Error('No such catalogue entry.');

  if (mappedKey) {
    const exists =
      entry.kind === 'PANEL'
        ? await prisma.panel.findUnique({ where: { key: mappedKey } })
        : entry.kind === 'TEST'
          ? await prisma.marker.findUnique({ where: { key: mappedKey } })
          : null;
    if (entry.kind !== 'PANEL' && entry.kind !== 'TEST') {
      throw new Error(`${entry.kind} entries are reference values, not orderable items, so there is nothing to map them to.`);
    }
    if (!exists) {
      throw new Error(`No ${entry.kind === 'PANEL' ? 'panel' : 'marker'} in our catalogue with key "${mappedKey}".`);
    }
  }

  await prisma.randoxCatalogueEntry.update({
    where: { id },
    data: { mappedKey, mappedAt: mappedKey ? new Date() : null },
  });

  await recordAuditLog({
    actorUserId,
    action: mappedKey ? 'RANDOX_CATALOGUE_MAPPED' : 'RANDOX_CATALOGUE_UNMAPPED',
    targetType: 'RandoxCatalogueEntry',
    targetId: id,
    ipAddress: ip,
    metadata: { kind: entry.kind, randoxId: entry.randoxId, randoxName: entry.name, mappedKey },
  });
}
