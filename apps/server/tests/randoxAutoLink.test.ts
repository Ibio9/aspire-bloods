import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakePrisma, seedCatalogue, seedPatient, seedOrder, type FakePrisma } from './support/fakePrisma.js';

/**
 * ---------------------------------------------------------------------------
 * The automatic link, and every way it must refuse.
 * ---------------------------------------------------------------------------
 *
 * A result now reaches a patient's account with nobody typing anything. That
 * is the point of the feature and it is also the thing that makes it
 * dangerous, so the tests here are written as the refusals rather than as the
 * happy path: wrong-patient results is the worst failure this system has, and
 * the only useful proof is that the paths which would produce one all stop.
 *
 * Each one exercises the real ingestion entry point against an in-memory
 * database, not a mocked call — the questions are about what ended up in the
 * tables afterwards.
 */

const db: FakePrisma = createFakePrisma();

vi.mock('../src/db/client.js', () => ({ prisma: db }));

// Storage is a disk write and irrelevant to whose results these are.
vi.mock('../src/modules/storage/LocalDiskStorageAdapter.js', () => ({
  storageAdapter: { save: async () => ({ storageKey: 'k', sizeBytes: 1 }) },
}));

const detailByOrder = new Map<string, unknown>();
const getOrderResultDetail = vi.fn(async (ref: { orderNumber: string }) => {
  const detail = detailByOrder.get(ref.orderNumber);
  if (!detail) throw new Error(`no fixture for ${ref.orderNumber}`);
  return detail;
});

vi.mock('../src/modules/randox/clients/index.js', () => ({
  nexusLabClient: () => ({
    getOrderResultDetail,
    getOrderResultReports: async () => null,
  }),
}));

const { ingestOrderResults } = await import('../src/modules/randox/ingestionService.js');
const { unlinkResult } = await import('../src/modules/admin/linkingService.js');
const { __setConfigCachesForTest } = await import('../src/modules/randox/config.js');

/**
 * A code map with exactly one known caveat in it, so the two facts that
 * matter here are both exercised: a recognised caveat annotates a reportable
 * result, and anything we do NOT recognise voids it. Unknown-means-void is
 * the intended direction of failure while the real Randox code list is still
 * outstanding, and it is what the voided-result tests below depend on.
 */
__setConfigCachesForTest(
  { 'HB-DIL': { kind: 'CAVEAT', description: 'Sample diluted before analysis.' } },
  { panels: {}, tests: {}, markerNameOverrides: {}, panelsByRandoxId: {} },
);

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

interface RowInput {
  analyte: string;
  result: string | null;
  units?: string;
  refLow?: string;
  refHigh?: string;
  lowHigh?: string;
  caveat?: string | null;
}

function payload(
  orderNumber: string,
  rows: RowInput[],
  identity: { firstName?: string; lastName?: string; dob?: string } = {},
) {
  return {
    orderId: 5001,
    orderNumber,
    orderCreatedDate: '2026-08-01T09:00:00.000Z',
    sampleCollectionDate: '2026-08-02T09:00:00.000Z',
    sampleAccessioningDate: null,
    sampleCancellationDate: null,
    resultsUploadDate: '2026-08-03T09:00:00.000Z',
    reportResults: rows.map((r) => ({
      orderNumber,
      dateOfReceipt: '2026-08-02T09:00:00.000Z',
      dateOfReport: '2026-08-03T09:00:00.000Z',
      analyte: r.analyte,
      group: 'Screen',
      result: r.result,
      units: r.units ?? 'g/L',
      refLow: r.refLow ?? '130',
      refHigh: r.refHigh ?? '170',
      lowHigh: r.lowHigh ?? '',
      sampleType: 'Serum',
      caveat: r.caveat ?? null,
      displayName: r.analyte,
    })),
    patientHeight: 178,
    patientWeight: 82,
    patientWaist: 92,
    patientHip: 101,
    patientPulse: 68,
    patientSystolicBloodPressure: 128,
    patientDiastolicBloodPressure: 79,
    patientIsDiabetic: false,
    patientIsSmoker: false,
    patientKnownVascularDisease: false,
    patientOnMedicationforHypertension: false,
    patientEthnicity: 'White',
    patientBiologicalSex: 'Male',
    patientFirstName: identity.firstName ?? null,
    patientLastName: identity.lastName ?? null,
    patientDateOfBirth: identity.dob ?? null,
  };
}

/** One clean, in-range haemoglobin. Nothing for an admin to look at. */
const CLEAN_ROWS: RowInput[] = [{ analyte: 'Haemoglobin', result: '145', units: 'g/L', refLow: '130', refHigh: '170' }];

const ref = (orderNumber: string) => ({ orderId: 5001, orderNumber, clinicId: 146 });

function reset() {
  for (const key of Object.keys(db) as (keyof FakePrisma)[]) {
    const table = db[key] as { rows?: unknown[] };
    if (table && Array.isArray(table.rows)) table.rows = [];
  }
  detailByOrder.clear();
  getOrderResultDetail.mockClear();
  seedCatalogue(db);
}

beforeEach(reset);

// ---------------------------------------------------------------------------

describe('auto-linking on an order we placed ourselves', () => {
  it('links the result to that order’s patient and lands it ready for clinician review', async () => {
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    seedOrder(db, {
      orderNumber: 'GC1123-001',
      patientId: 'p1',
      ordered: { firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' },
    });
    detailByOrder.set('GC1123-001', payload('GC1123-001', CLEAN_ROWS));

    const outcome = await ingestOrderResults(ref('GC1123-001'));

    expect(outcome.outcome).toBe('INGESTED');
    expect(db.report.rows).toHaveLength(1);
    expect(db.report.rows[0].patientId).toBe('p1');
    // A clean parse is awaiting clinician review and holds nothing. It stops
    // there — there is no route to RELEASED that does not pass a clinician.
    expect(db.report.rows[0].status).toBe('PARSED');
    expect(db.report.rows[0].holdReasons ?? []).toEqual([]);
    expect(db.reportResult.rows).toHaveLength(1);
  });

  it('audits the link with the evidence it matched on', async () => {
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    seedOrder(db, {
      orderNumber: 'GC1123-002',
      patientId: 'p1',
      ordered: { firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' },
    });
    detailByOrder.set('GC1123-002', payload('GC1123-002', CLEAN_ROWS));

    await ingestOrderResults(ref('GC1123-002'));

    const entry = db.auditLogEntry.rows.find((r) => r.action === 'RESULT_AUTO_LINKED_TO_PATIENT');
    expect(entry, 'an automatic link must be audited').toBeTruthy();
    expect(entry!.actorType).toBe('SYSTEM');
    expect(entry!.targetId).toBe('p1');

    const meta = entry!.metadata as Record<string, unknown>;
    const evidence = meta.evidence as Record<string, unknown>;
    expect(evidence.matchedOn).toBe('order_reference');
    expect(evidence.orderNumber).toBe('GC1123-002');
    expect(evidence.identityVerdict).toBe('AGREES');
    // What corroborated, so a wrong link is explainable afterwards and not
    // merely reversible.
    expect(evidence.orderSnapshot).toBe('agrees');

    // The audit entry proves we checked the date of birth without restating
    // it. An audit table is read by more people than a patient record is.
    expect(JSON.stringify(meta)).not.toContain('1988-04-12');
  });

  it('records the link in one place, so it can be undone the same way a manual one is', async () => {
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    seedOrder(db, {
      orderNumber: 'GC1123-003',
      patientId: 'p1',
      ordered: { firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' },
    });
    detailByOrder.set('GC1123-003', payload('GC1123-003', CLEAN_ROWS));

    await ingestOrderResults(ref('GC1123-003'));

    const row = db.unmatchedResult.rows[0];
    expect(row.status).toBe('LINKED');
    expect(row.linkMode).toBe('AUTOMATIC');
    // No person decided it, and the record says so rather than leaving an
    // absent actor to be read as a lost one.
    expect(row.linkedById).toBeNull();
    expect(row.linkEvidence).toBeTruthy();
  });
});

describe('refusals — the paths that must never reach a patient', () => {
  it('never links when the order number matches but the date of birth does not', async () => {
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    seedOrder(db, {
      orderNumber: 'GC1123-010',
      patientId: 'p1',
      ordered: { firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' },
    });
    // The laboratory returns the right name against the right order number,
    // and somebody else's date of birth. The reference is not enough.
    detailByOrder.set(
      'GC1123-010',
      payload('GC1123-010', CLEAN_ROWS, { firstName: 'Aisha', lastName: 'Khan', dob: '1970-01-01' }),
    );

    const outcome = await ingestOrderResults(ref('GC1123-010'));

    expect(outcome.outcome).toBe('UNMATCHED_PATIENT');
    expect(db.report.rows, 'no report may exist for a result that did not corroborate').toHaveLength(0);
    expect(db.reportResult.rows).toHaveLength(0);

    const queued = db.unmatchedResult.rows[0];
    expect(queued.status).toBe('PENDING');
    expect(queued.reason).toBe('IDENTITY_MISMATCH');
    expect(String(queued.reasonDetail)).toMatch(/date of birth/i);
  });

  it('never links when the order number matches but the name does not', async () => {
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    seedOrder(db, {
      orderNumber: 'GC1123-011',
      patientId: 'p1',
      ordered: { firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' },
    });
    detailByOrder.set(
      'GC1123-011',
      payload('GC1123-011', CLEAN_ROWS, { firstName: 'Aisha', lastName: 'Okafor', dob: '1988-04-12' }),
    );

    const outcome = await ingestOrderResults(ref('GC1123-011'));

    expect(outcome.outcome).toBe('UNMATCHED_PATIENT');
    expect(db.report.rows).toHaveLength(0);
    expect(db.unmatchedResult.rows[0].reason).toBe('IDENTITY_MISMATCH');
  });

  it('cannot confuse two patients who share a name — the reference decides, and the birthday holds it', async () => {
    // The realistic version of this: two Sarah Joneses registered at the same
    // practice, each with their own order.
    seedPatient(db, { id: 'sarah-a', firstName: 'Sarah', lastName: 'Jones', dob: '1979-06-03' });
    seedPatient(db, { id: 'sarah-b', firstName: 'Sarah', lastName: 'Jones', dob: '1991-11-22' });
    seedOrder(db, {
      orderNumber: 'GC1123-020',
      patientId: 'sarah-a',
      ordered: { firstName: 'Sarah', lastName: 'Jones', dob: '1979-06-03' },
    });
    seedOrder(db, {
      orderNumber: 'GC1123-021',
      patientId: 'sarah-b',
      ordered: { firstName: 'Sarah', lastName: 'Jones', dob: '1991-11-22' },
    });
    detailByOrder.set(
      'GC1123-020',
      payload('GC1123-020', CLEAN_ROWS, { firstName: 'Sarah', lastName: 'Jones', dob: '1979-06-03' }),
    );
    detailByOrder.set(
      'GC1123-021',
      payload('GC1123-021', CLEAN_ROWS, { firstName: 'Sarah', lastName: 'Jones', dob: '1991-11-22' }),
    );

    await ingestOrderResults(ref('GC1123-020'));
    await ingestOrderResults(ref('GC1123-021'));

    const byExternal = new Map(db.report.rows.map((r) => [r.externalId, r.patientId]));
    expect(byExternal.get('GC1123-020')).toBe('sarah-a');
    expect(byExternal.get('GC1123-021')).toBe('sarah-b');
    expect(db.report.rows).toHaveLength(2);
  });

  it('refuses the older Sarah’s result if it arrives carrying the younger one’s birthday', async () => {
    seedPatient(db, { id: 'sarah-a', firstName: 'Sarah', lastName: 'Jones', dob: '1979-06-03' });
    seedPatient(db, { id: 'sarah-b', firstName: 'Sarah', lastName: 'Jones', dob: '1991-11-22' });
    seedOrder(db, {
      orderNumber: 'GC1123-022',
      patientId: 'sarah-a',
      ordered: { firstName: 'Sarah', lastName: 'Jones', dob: '1979-06-03' },
    });
    // Same name, wrong birthday, right order number. Nothing about the name
    // is allowed to rescue this.
    detailByOrder.set(
      'GC1123-022',
      payload('GC1123-022', CLEAN_ROWS, { firstName: 'Sarah', lastName: 'Jones', dob: '1991-11-22' }),
    );

    await ingestOrderResults(ref('GC1123-022'));

    expect(db.report.rows).toHaveLength(0);
    expect(db.unmatchedResult.rows[0].reason).toBe('IDENTITY_MISMATCH');
  });

  it('waits when the result is for a patient with no account, rather than attaching it to anyone', async () => {
    // A result arrives for an order number we have no record of at all.
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    detailByOrder.set('GC1123-030', payload('GC1123-030', CLEAN_ROWS, { firstName: 'Someone', lastName: 'New' }));

    const outcome = await ingestOrderResults(ref('GC1123-030'));

    expect(outcome.outcome).toBe('UNMATCHED_PATIENT');
    expect(db.report.rows).toHaveLength(0);
    expect(db.unmatchedResult.rows[0].reason).toBe('NO_MATCHING_ORDER');
    // It is held, not discarded — the whole payload is kept so linking can
    // replay it once the account exists.
    expect(db.unmatchedResult.rows[0].payload).toBeTruthy();
  });

  it('waits when the account on the order has no registration details yet', async () => {
    seedPatient(db, { id: 'p2', firstName: 'x', lastName: 'y', dob: '1990-01-01', withProfile: false });
    seedOrder(db, { orderNumber: 'GC1123-031', patientId: 'p2', ordered: null });
    detailByOrder.set('GC1123-031', payload('GC1123-031', CLEAN_ROWS));

    await ingestOrderResults(ref('GC1123-031'));

    expect(db.report.rows).toHaveLength(0);
    expect(db.unmatchedResult.rows[0].reason).toBe('NO_PATIENT_ACCOUNT');
  });

  it('refuses to link on the order reference alone when nothing corroborates it', async () => {
    // An order placed before the identity snapshot was captured, and a lab
    // payload with no identity on it. The reference matches and nothing
    // contradicts — and that is still not enough.
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    seedOrder(db, { orderNumber: 'GC1123-040', patientId: 'p1', ordered: null });
    detailByOrder.set('GC1123-040', payload('GC1123-040', CLEAN_ROWS));

    await ingestOrderResults(ref('GC1123-040'));

    expect(db.report.rows).toHaveLength(0);
    expect(db.unmatchedResult.rows[0].reason).toBe('UNCORROBORATED_IDENTITY');
  });

  it('does not re-link a result a person has unlinked, however many times it is redelivered', async () => {
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    seedPatient(db, { id: 'staff', firstName: 'Admin', lastName: 'User', dob: '1980-01-01' });
    seedOrder(db, {
      orderNumber: 'GC1123-050',
      patientId: 'p1',
      ordered: { firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' },
    });
    detailByOrder.set('GC1123-050', payload('GC1123-050', CLEAN_ROWS));

    await ingestOrderResults(ref('GC1123-050'));
    const linkRow = db.unmatchedResult.rows[0];
    expect(linkRow.status).toBe('LINKED');

    await unlinkResult(linkRow.id, 'Filed against the wrong account', 'staff', null);

    // Voided, not deleted, and off the order.
    expect(db.report.rows[0].voidedAt).toBeTruthy();
    expect(db.randoxOrder.rows[0].reportId).toBeNull();

    const audit = db.auditLogEntry.rows.find((r) => r.action === 'RESULT_UNLINKED_FROM_PATIENT');
    expect(audit, 'unlinking must be audited').toBeTruthy();
    expect((audit!.metadata as Record<string, unknown>).wasAutomatic).toBe(true);

    // The next poll comes round. It must not undo the correction.
    const before = db.report.rows.length;
    const again = await ingestOrderResults(ref('GC1123-050'));
    expect(again.outcome).toBe('UNMATCHED_PATIENT');
    expect(db.report.rows).toHaveLength(before);
    expect(db.unmatchedResult.rows[0].status).toBe('PENDING');
    expect(db.unmatchedResult.rows[0].reason).toBe('PREVIOUSLY_UNLINKED');
  });
});

describe('what stops for an admin, and what does not', () => {
  it('holds a report at parsed when a marker could not be filed, rather than advancing it', async () => {
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    seedOrder(db, {
      orderNumber: 'GC1123-060',
      patientId: 'p1',
      ordered: { firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' },
    });
    detailByOrder.set(
      'GC1123-060',
      payload('GC1123-060', [
        ...CLEAN_ROWS,
        // Nothing in the catalogue answers to this.
        { analyte: 'Zorbulin', result: '4.2', units: 'mmol/L', refLow: '1', refHigh: '9' },
      ]),
    );

    await ingestOrderResults(ref('GC1123-060'));

    // Linked — the identity is not in question. Held — the parse is not clean.
    expect(db.report.rows[0].patientId).toBe('p1');
    expect(db.report.rows[0].status).toBe('PARSED');
    // And the reason is stated, not left to be noticed.
    const log = db.ingestionLogEntry.rows.at(-1);
    expect(String(log!.message)).toMatch(/HELD for review/i);
  });

  it('holds a report at parsed when Randox’s own high/low flag disagrees with the range they sent', async () => {
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    seedOrder(db, {
      orderNumber: 'GC1123-061',
      patientId: 'p1',
      ordered: { firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' },
    });
    detailByOrder.set(
      'GC1123-061',
      payload('GC1123-061', [
        // 145 sits inside 130–170, and the lab says it is high. One of us is
        // reading a different range; neither answer is quietly preferred.
        { analyte: 'Haemoglobin', result: '145', units: 'g/L', refLow: '130', refHigh: '170', lowHigh: 'H' },
      ]),
    );

    await ingestOrderResults(ref('GC1123-061'));

    expect(db.report.rows[0].status).toBe('PARSED');
    expect(db.reportResult.rows[0].labStatusDisagrees).toBe(true);
  });

  it('creates no report at all when every result on the order was voided', async () => {
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    seedOrder(db, {
      orderNumber: 'GC1123-070',
      patientId: 'p1',
      ordered: { firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' },
    });
    // An unrecognised code voids the result — that is the intended direction
    // of failure for a code map we have not been given yet.
    detailByOrder.set(
      'GC1123-070',
      payload('GC1123-070', [{ analyte: 'Haemoglobin', result: '145', caveat: 'SOME-UNKNOWN-CODE' }]),
    );

    const outcome = await ingestOrderResults(ref('GC1123-070'));

    expect(outcome.outcome).toBe('ALL_VOIDED');
    expect(db.report.rows, 'a voided order produces no report').toHaveLength(0);
    expect(db.reportResult.rows, 'and therefore no ReportResult row').toHaveLength(0);
    // The order stops being polled — nothing further will arrive.
    expect(db.randoxOrder.rows[0].status).toBe('CANCELLED');
    expect(db.randoxOrder.rows[0].nextPollAt).toBeNull();
  });

  it('writes no ReportResult for the voided markers on a partly voided order', async () => {
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    seedOrder(db, {
      orderNumber: 'GC1123-071',
      patientId: 'p1',
      ordered: { firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' },
    });
    detailByOrder.set(
      'GC1123-071',
      payload('GC1123-071', [
        { analyte: 'Haemoglobin', result: '145', units: 'g/L', refLow: '130', refHigh: '170' },
        { analyte: 'Ferritin', result: '60', units: 'ug/L', refLow: '30', refHigh: '400', caveat: 'UNKNOWN-VOID' },
      ]),
    );

    await ingestOrderResults(ref('GC1123-071'));

    expect(db.reportResult.rows).toHaveLength(1);
    expect(db.reportResult.rows[0].markerId).toBe('marker-haemoglobin');
    // The withheld one is recorded as withheld, not merely absent — the
    // patient paid for that test and would otherwise just find it missing.
    expect(db.reportResultExclusion.rows).toHaveLength(1);
    expect(db.reportResultExclusion.rows[0].rawMarkerName).toBe('Ferritin');
  });

  it('captures the clinic-visit measurements alongside the analytes', async () => {
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    seedOrder(db, {
      orderNumber: 'GC1123-080',
      patientId: 'p1',
      ordered: { firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' },
    });
    detailByOrder.set('GC1123-080', payload('GC1123-080', CLEAN_ROWS));

    await ingestOrderResults(ref('GC1123-080'));

    const m = db.reportMeasurements.rows[0];
    expect(m).toBeTruthy();
    expect(m.heightCm).toBe(178);
    expect(m.systolicBp).toBe(128);
    expect(m.biologicalSex).toBe('MALE');
    // Never a ReportResult: these have no reference range and inventing one
    // to satisfy the column would be inventing a range.
    expect(db.reportResult.rows.every((r) => String(r.markerId).startsWith('marker-'))).toBe(true);
  });
});
