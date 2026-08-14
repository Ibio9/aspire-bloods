import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakePrisma, seedCatalogue, seedPatient, type FakePrisma } from './support/fakePrisma.js';

/**
 * ---------------------------------------------------------------------------
 * The whole thing, once, against the mock: order → poll → results → a report
 * the patient can read.
 * ---------------------------------------------------------------------------
 *
 * Every other test in this suite takes one seam apart. This one runs the chain
 * the clinic actually depends on and asserts the two properties that matter at
 * the end of it:
 *
 *   1. Nobody typed anything. No admin action occurs anywhere between
 *      CreatePendingOrder and the patient being able to see their results —
 *      which since Aug 2026 is the whole chain rather than most of it.
 *   2. It went all the way. RELEASED, with every audit entry written by SYSTEM.
 *      What stops a bad delivery is not a stage in the pipeline any more, it is
 *      the hold refusing the release, which is asserted at the end.
 */

const db: FakePrisma = createFakePrisma();
vi.mock('../src/db/client.js', () => ({ prisma: db }));
vi.mock('../src/modules/storage/LocalDiskStorageAdapter.js', () => ({
  storageAdapter: { save: async () => ({ storageKey: 'k', sizeBytes: 1 }) },
}));
// Escalation now runs inside releaseReport, and it reads the report through a
// nested `include` the fake does not implement. Mocked out here because this
// file's subject is the ORDER lifecycle; what escalation sends, and the fact
// that it is sent before the status write, is automaticRelease.test.ts.
vi.mock('../src/modules/escalation/service.js', () => ({
  checkAndEscalate: vi.fn(async () => ({
    escalated: false,
    severity: null,
    flaggedCount: 0,
    significantCount: 0,
    channels: [],
  })),
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
const { canPerform, releaseBlockedByHolds } = await import('../src/lib/reportTransitions.js');

beforeEach(() => {
  for (const key of Object.keys(db) as (keyof FakePrisma)[]) {
    const table = db[key] as { rows?: unknown[] };
    if (table && Array.isArray(table.rows)) table.rows = [];
  }
  seedCatalogue(db);
  mockClient.reset();
  db.panel.rows.push({ id: 'panel-core', key: 'core-screen', name: 'Core Screen', isActive: true });
});

describe('order to a released report, with nobody typing anything', () => {
  // "stops at admin-verified" until Aug 2026 — a test named after the stage
  // that was deleted when the second gate went. What the chain actually does is
  // stop at PARSED with no holds, which is "waiting for a clinician".
  it('runs the whole chain and puts a clean delivery in front of the patient', async () => {
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

    // 4. WHERE IT ENDED, AND THAT NO HUMAN TOUCHED IT TO GET THERE (changed
    // Aug 2026). It used to stop at PARSED and wait for a clinician. A clean
    // delivery now releases itself, so the end of this walk is the patient
    // being able to see it — with every audit entry along the way written by
    // SYSTEM, because nobody was involved at any point.
    expect(report.status).toBe('RELEASED');
    expect(report.releasedAt ?? null, 'a clean delivery reaches the patient').not.toBeNull();
    expect(report.holdReasons ?? [], 'a clean delivery holds nothing').toEqual([]);
    expect(report.verifiedById ?? null, 'no staff member verified this; the audit log is the record').toBeNull();
    expect(report.reviewedById ?? null, 'and nobody reviewed it either').toBeNull();
    expect(db.auditLogEntry.rows.every((e) => e.actorUserId === null)).toBe(true);
    expect(
      db.auditLogEntry.rows.some((e) => e.action === 'REPORT_RELEASED'),
      'the release is on the record even though nobody performed it',
    ).toBe(true);

    // 5. THE ONE CHECKPOINT LEFT. There is no gate, and what replaced it is a
    // refusal: release is permitted from PARSED (which is what makes automatic
    // release possible at all) and is refused outright while anything is held.
    expect(canPerform('release', 'PARSED')).toBe(true);
    expect(canPerform('release', 'UPLOADED'), 'nothing unread can reach a patient').toBe(false);
    expect(releaseBlockedByHolds({ holdReasons: ['anything at all'] }, false)).toBe(true);

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
