import type { Prisma, RandoxCatalogueKind } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { nexusLabClient } from './clients/index.js';
import { isRandoxEnabled } from './config.js';

/**
 * Randox's own reference data, fetched and cached rather than hardcoded.
 *
 * Nexus publishes EIGHT self-serve GET endpoints — GetPanels, GetTests,
 * GetMyClinicDetails, GetClinicStaff, GetBiologicalSex, GetEthnicity,
 * GetTestingReasons, GetCancellationReasons — and every one of them is the
 * authority on values
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

  await run('GetClinicStaff', async () =>
    upsertKind(
      'CLINIC_STAFF',
      (await client.getClinicStaff()).map((m) => ({
        randoxId: m.userId,
        name: [m.firstName, m.lastName].filter(Boolean).join(' ') || m.userId,
        code: m.role,
        payload: m,
      })),
    ),
  );

  await recordAuditLog({
    actorUserId,
    actorType: actorUserId ? 'USER' : 'SYSTEM',
    action: 'RANDOX_REFERENCE_DATA_REFRESHED',
    targetType: 'RandoxCatalogueEntry',
    metadata: { summaries: summaries as unknown as Prisma.InputJsonValue, failures },
  });

  if (failures.length > 0) {
    throw new Error(`Refreshed ${summaries.length} of 8 reference sets. Failed: ${failures.join('; ')}`);
  }

  return summaries;
}

/**
 * ---------------------------------------------------------------------------
 * THE LOOKUPS THE ORDER PATH CANNOT WORK WITHOUT, AND WHAT AN EMPTY ONE MEANS.
 * ---------------------------------------------------------------------------
 *
 * Four of these endpoints return ids we have to SEND BACK on an order:
 * GetBiologicalSex, GetEthnicity, GetTestingReasons, GetCancellationReasons.
 * A fifth, GetMyClinicDetails, is where the clinic id and the
 * clinicTestLocations that TestClinicLocationId comes from live.
 *
 * NONE OF THOSE IDS IS EVER HARDCODED. What the code holds is a mapping from
 * our own values (PatientProfile.sex, our cancellation reasons) to whatever
 * Randox's ids currently are — our records keep our values, and the Randox id
 * is a translation of them rather than a replacement for them.
 *
 * AN EMPTY LOOKUP IS A FAILURE, NOT A QUIET ZERO. A refresh that "succeeds"
 * with no biological sexes in it leaves resolveBiologicalSexId falling back to
 * the documented 1/2 default forever, and the first anyone hears of it is a
 * 400 from Randox on a real patient's order — or worse, no 400 at all and an
 * order placed under the wrong sex, which changes the reference ranges the
 * laboratory applies. So the ones the order path depends on are named here and
 * an empty one is thrown.
 */
const ORDER_CRITICAL_KINDS = [
  { kind: 'BIOLOGICAL_SEX' as const, endpoint: 'GetBiologicalSex', why: 'CreatePendingOrder requires BiologicalSexId on every order' },
  { kind: 'TESTING_REASON' as const, endpoint: 'GetTestingReasons', why: 'CreatePendingOrder requires a non-empty TestReasons array' },
  { kind: 'CANCELLATION_REASON' as const, endpoint: 'GetCancellationReasons', why: 'CancelOrder takes a CancellationReasonId, not free text' },
  { kind: 'CLINIC_LOCATION' as const, endpoint: 'GetMyClinicDetails', why: 'TestClinicLocationId comes from the clinic’s test locations' },
];

/**
 * Every lookup the order path depends on, checked for emptiness.
 *
 * ETHNICITY IS DELIBERATELY NOT IN THE LIST. It is optional on
 * CreatePendingOrder — it only appears on the full CreateOrder form — so an
 * empty ethnicity list stops nothing, and treating it as fatal would refuse to
 * boot over a field no order currently sends.
 */
export async function assertReferenceDataUsable(): Promise<void> {
  const empty: string[] = [];
  for (const { kind, endpoint, why } of ORDER_CRITICAL_KINDS) {
    const count = await prisma.randoxCatalogueEntry.count({ where: { kind, isCurrent: true } });
    if (count === 0) empty.push(`  - ${endpoint} returned nothing (${kind}). ${why}.`);
  }
  if (empty.length > 0) {
    throw new Error(
      `Randox reference data is unusable: ${empty.length} lookup(s) the order path depends on are empty.\n` +
        empty.join('\n') +
        '\nNo order can be placed correctly until these return values. Check the subscription key and the clinic’s ' +
        'entitlements with Randox rather than falling back to hardcoded ids — a wrong BiologicalSexId changes which ' +
        'reference ranges the laboratory applies.',
    );
  }
}

/**
 * The sync, run on boot and on demand.
 *
 * ON BOOT it is best-effort and NEVER stops the server: results ingestion, the
 * patient portal and every clinician screen work perfectly well against a
 * stale or absent catalogue, and refusing to start the whole product because
 * Randox were slow at 3am would be a self-inflicted outage. It logs loudly
 * instead, and the order path refuses on its own when it finds a lookup it
 * needs is empty (assertReferenceDataUsable).
 *
 * It is skipped when the data is still inside its TTL, so a restart loop does
 * not become a call loop.
 */
export async function syncReferenceDataOnBoot(): Promise<void> {
  if (!isRandoxEnabled()) return;
  try {
    if (!(await isReferenceDataStale())) {
      console.log('[randox] reference data is inside its TTL; skipping the boot sync.');
      return;
    }
    const summaries = await refreshReferenceData(null);
    console.log(
      `[randox] reference data synced on boot: ${summaries.map((s) => `${s.kind} ${s.fetched}`).join(', ')}.`,
    );
    await assertReferenceDataUsable();
  } catch (e) {
    // Loud, and not fatal. See the note above.
    console.error(
      `[randox] reference data sync failed on boot: ${e instanceof Error ? e.message : 'unknown error'}\n` +
        '  The server is still running. Results ingestion is unaffected; ORDER PLACEMENT may not be, because the ' +
        'ids an order carries come from these endpoints. Retry from the admin console (Randox → refresh reference data).',
    );
  }
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
