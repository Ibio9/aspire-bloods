import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakePrisma, seedCatalogue, seedPatient, type FakePrisma } from './support/fakePrisma.js';

/**
 * ---------------------------------------------------------------------------
 * The whole thing, once, against the mock: order → poll → results → a report
 * sitting ready for a clinician.
 * ---------------------------------------------------------------------------
 *
 * Every other test in this suite takes one seam apart. This one runs the
 * chain the clinic actually depends on and asserts the two properties that
 * matter at the end of it:
 *
 *   1. Nobody typed anything. No admin action occurs anywhere between
 *      CreatePendingOrder and a report waiting to be released.
 *   2. It stopped exactly where it should. PARSED, not RELEASED —
 *      and the state machine physically prevents the difference, rather than
 *      the absence of a button in the UI doing it.
 */

const db: FakePrisma = createFakePrisma();
vi.mock('../src/db/client.js', () => ({ prisma: db }));
vi.mock('../src/modules/storage/LocalDiskStorageAdapter.js', () => ({
  storageAdapter: { save: async () => ({ storageKey: 'k', sizeBytes: 1 }) },
}));

// The whole flow on the mock transport, which is what "ready for a key" means
// — everything works, and the only thing left is which client is constructed.
const { MockNexusLabClient } = await import('../src/modules/randox/mock/MockNexusLabClient.js');
const mockClient = new MockNexusLabClient();
vi.mock('../src/modules/randox/clients/index.js', () => ({ nexusLabClient: () => mockClient }));

vi.mock('../src/modules/randox/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/randox/config.js')>();
  return {
    ...actual,
    isRandoxEnabled: () => true,
    isCollectionMethodEnabled: () => true,
    enabledCollectionMethods: () => ['IN_CLINIC'],
    randoxClinicId: () => 146,
    randoxTestClinicLocationId: () => 146,
    defaultTestReason: () => ({ Id: 1, Details: 'Private health screening requested by the patient.' }),
    loadIdMap: () => ({ panels: { 'core-screen': '71' }, tests: {}, markerNameOverrides: {}, panelsByRandoxId: { '71': 'core-screen' } }),
    loadCodeMap: () => ({ map: { 'HB-DIL': { kind: 'CAVEAT', description: 'Diluted.' } }, source: 'test' }),
  };
});

const { placeOrder } = await import('../src/modules/randox/orderService.js');
const { onOrderStatusChanged } = await import('../src/modules/randox/pollingJob.js');
const { canPerform } = await import('../src/lib/reportTransitions.js');

beforeEach(() => {
  for (const key of Object.keys(db) as (keyof FakePrisma)[]) {
    const table = db[key] as { rows?: unknown[] };
    if (table && Array.isArray(table.rows)) table.rows = [];
  }
  seedCatalogue(db);
  mockClient.reset();
  db.panel.rows.push({ id: 'panel-core', key: 'core-screen', name: 'Core Screen', isActive: true });
});

describe('order to a report ready for release, with nobody typing anything', () => {
  it('runs the whole chain and stops at admin-verified', async () => {
    seedPatient(db, {
      id: 'p1',
      firstName: 'Aisha',
      lastName: 'Khan',
      dob: '1988-04-12',
      sex: 'FEMALE',
    });
    // Randox echo identity back on the result, so both halves of the
    // corroboration are exercised, not just the snapshot.
    mockClient.identityEcho = 'matching';

    // 1. The order.
    const order = await placeOrder({
      patientId: 'p1',
      panelKeys: ['core-screen'],
      markerKeys: [],
      collectionMethod: 'IN_CLINIC',
      placedById: null,
    });
    expect(order.orderNumber).toMatch(/^GC1123-/);
    // The identity the laboratory now holds against this order, captured at
    // the moment it was sent.
    expect(order.orderedLastName).toBe('Khan');
    expect(order.orderedDobEncrypted).toBeTruthy();

    // The order row on the fake needs its relation materialised, the way
    // seedOrder does — the fake does not implement `include`.
    const row = db.randoxOrder.rows[0];
    row.patient = {
      ...db.user.rows.find((u) => u.id === 'p1'),
      patientProfile: db.patientProfile.rows.find((p) => p.userId === 'p1'),
    };

    // 2. Polling. The mock advances 3 → 4 across two calls, as the real API
    // does, rather than having results ready the instant an order exists.
    const first = await onOrderStatusChanged(order.orderNumber);
    expect(first.ingested).toBe(false);
    expect(db.report.rows).toHaveLength(0);

    const second = await onOrderStatusChanged(order.orderNumber);
    expect(second.ingested).toBe(true);

    // 3. The report. Attached to the right patient, with results on it.
    expect(db.report.rows).toHaveLength(1);
    const report = db.report.rows[0];
    expect(report.patientId).toBe('p1');
    expect(db.reportResult.rows.length).toBeGreaterThan(0);

    // 4. Where it stopped — and that no human touched it to get there. PARSED
    // with nothing held is "awaiting clinician review"; the clean/held
    // distinction is holdReasons rather than a status of its own now that the
    // admin verification stage is gone.
    expect(report.status).toBe('PARSED');
    expect(report.holdReasons ?? [], 'a clean delivery holds nothing').toEqual([]);
    expect(report.verifiedById ?? null, 'no staff member verified this; the audit log is the record').toBeNull();
    expect(report.releasedAt ?? null).toBeNull();
    expect(db.auditLogEntry.rows.every((e) => e.actorUserId === null)).toBe(true);

    // 5. The gate, and there is exactly one. A report cannot be released from
    // here — the only route to RELEASED is through CLINICIAN_REVIEWED, and the
    // only route into that is a clinician reviewing it from PARSED.
    expect(canPerform('release', 'PARSED')).toBe(false);
    expect(canPerform('review', 'PARSED')).toBe(true);
    expect(canPerform('release', 'CLINICIAN_REVIEWED')).toBe(true);

    // 6. Polling stops. A completed order is not asked about again.
    expect(db.randoxOrder.rows[0].nextPollAt).toBeNull();
    expect(db.randoxOrder.rows[0].status).toBe('COMPLETE');

    // 7. The clinic-visit measurements came across with it.
    expect(db.reportMeasurements.rows[0].heightCm).toBe(178);
  });

  it('routes a result whose identity the laboratory contradicts to the queue instead', async () => {
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12', sex: 'FEMALE' });
    // Same order, same reference — and Randox return somebody else's birthday.
    mockClient.identityEcho = 'mismatched-dob';

    const order = await placeOrder({
      patientId: 'p1',
      panelKeys: ['core-screen'],
      markerKeys: [],
      collectionMethod: 'IN_CLINIC',
      placedById: null,
    });
    const row = db.randoxOrder.rows[0];
    row.patient = {
      ...db.user.rows.find((u) => u.id === 'p1'),
      patientProfile: db.patientProfile.rows.find((p) => p.userId === 'p1'),
    };

    await onOrderStatusChanged(order.orderNumber);
    await onOrderStatusChanged(order.orderNumber);

    expect(db.report.rows, 'nothing may be written for a result that did not corroborate').toHaveLength(0);
    expect(db.unmatchedResult.rows[0].reason).toBe('IDENTITY_MISMATCH');
    // And it keeps being polled — the results exist at Randox and the
    // question is only whose they are.
    expect(db.randoxOrder.rows[0].nextPollAt).toBeTruthy();
  });
});
