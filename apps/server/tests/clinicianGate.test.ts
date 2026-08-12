import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakePrisma, seedCatalogue, seedPatient, type FakePrisma } from './support/fakePrisma.js';

/**
 * ---------------------------------------------------------------------------
 * THE ONE HUMAN GATE, AND THE TWO WAYS ROUND IT THAT HAD TO BE CLOSED.
 * ---------------------------------------------------------------------------
 *
 * `ADMIN_VERIFIED` is gone, so a clean parse now goes straight to awaiting
 * clinician review and the clean/held distinction lives on the report rather
 * than in the pipeline. That moves the safety property from something the state
 * machine enforced structurally to something `reviewReport` has to enforce
 * itself — which is worth testing over the real service functions rather than
 * over the transition table, because the table cannot see a hold.
 *
 * Two holes, one of which was real:
 *
 *  1. Approving a held report as though it were clean. Refused unless the holds
 *     are acknowledged, and the acknowledgement is stamped and audited.
 *  2. THE PUBLISH PATH. `publishReport` runs verify → review → release, and
 *     `verify` legitimately CLEARS the holds (a person has just entered every
 *     row deliberately). So by the time the review ran there was nothing left to
 *     acknowledge, and the one-click path would have published a held report
 *     with no acknowledgement at all. Not a bypass anybody chose — a bypass
 *     produced by the order of three calls. `publishReport` reads the holds
 *     before verify runs.
 */

const db: FakePrisma = createFakePrisma();
vi.mock('../src/db/client.js', () => ({ prisma: db }));

const { reviewReport, publishReport, verifyReport, releaseReport, ReportError } = await import(
  '../src/modules/reports/service.js'
);

/**
 * The row, typed once. `FakeRow` is an index signature, so every assertion below
 * would otherwise carry its own cast — and a cast per assertion is a cast nobody
 * reads.
 */
interface ReportRow {
  status: string;
  reviewedById: string | null;
  holdReasons: string[];
  heldAt: Date | null;
  holdsAcknowledgedAt: Date | null;
  holdsAcknowledgedById: string | null;
}
const reportRow = () => db.report.rows[0] as unknown as ReportRow;

interface AuditRow {
  action: string;
  metadata: { acknowledgedHolds?: string[] };
}
const auditRows = () => db.auditLogEntry.rows as unknown as AuditRow[];

const measuredMarkerId = () => {
  const marker = db.marker.rows.find((m) => m.resultType === 'MEASURED');
  if (!marker) throw new Error('the fake catalogue has no measured marker');
  return marker.id as string;
};

const CLINICIAN = 'clinician-1';
const HOLD = '1 result could not be matched to a marker in our catalogue (Zorbulin).';

function seedReport(over: { status?: string; holdReasons?: string[] } = {}) {
  const source = db.source.rows.find((s) => s.key === 'randox_api') ?? db.source.rows[0];
  const patient = db.user.rows.find((u) => u.id === 'p1');
  const report = {
    // The fake does not implement `include`, so the relations verifyReport asks
    // for are materialised on the row — same approach as seedOrder.
    patient,
    source,
    id: 'r1',
    patientId: 'p1',
    sourceId: source.id,
    panelId: null,
    sampleDate: new Date('2026-08-01'),
    status: over.status ?? 'PARSED',
    holdReasons: over.holdReasons ?? [],
    heldAt: (over.holdReasons ?? []).length > 0 ? new Date('2026-08-01') : null,
    holdsAcknowledgedAt: null,
    holdsAcknowledgedById: null,
    voidedAt: null,
    createdAt: new Date('2026-08-01'),
  };
  db.report.rows.push(report as never);
  return report;
}

beforeEach(() => {
  for (const table of Object.values(db)) {
    if (table && typeof table === 'object' && 'rows' in table) (table as { rows: unknown[] }).rows.length = 0;
  }
  seedCatalogue(db);
  seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
  db.user.rows.push({ id: CLINICIAN, email: 'clinician@aspireshield.dev', role: 'CLINICIAN' } as never);
});

describe('reviewing a clean report', () => {
  it('approves from PARSED, which is the only route into CLINICIAN_REVIEWED', async () => {
    seedReport();
    await reviewReport('r1', true, undefined, CLINICIAN, null);
    const report = reportRow();
    expect(report.status).toBe('CLINICIAN_REVIEWED');
    expect(report.reviewedById).toBe(CLINICIAN);
  });

  it('needs no acknowledgement, because there is nothing to acknowledge', async () => {
    seedReport();
    await reviewReport('r1', true, undefined, CLINICIAN, null);
    const report = reportRow();
    // Not stamped on a clean report: an acknowledgement on every report is an
    // acknowledgement that means nothing on the ones that need it.
    expect(report.holdsAcknowledgedAt ?? null).toBeNull();
  });
});

describe('reviewing a held report', () => {
  it('refuses to approve it without the acknowledgement', async () => {
    seedReport({ holdReasons: [HOLD] });
    await expect(reviewReport('r1', true, undefined, CLINICIAN, null)).rejects.toThrow(ReportError);
    // And the report did not move. A refusal that left it half-advanced would be
    // worse than the bypass.
    expect(reportRow().status).toBe('PARSED');
  });

  it('names the reasons in the refusal, so the 409 is actionable', async () => {
    seedReport({ holdReasons: [HOLD] });
    await expect(reviewReport('r1', true, undefined, CLINICIAN, null)).rejects.toThrow(/Zorbulin/);
  });

  it('approves it with the acknowledgement, and stamps who acknowledged', async () => {
    seedReport({ holdReasons: [HOLD] });
    await reviewReport('r1', true, undefined, CLINICIAN, null, true);
    const report = reportRow();
    expect(report.status).toBe('CLINICIAN_REVIEWED');
    expect(report.holdsAcknowledgedAt).toBeTruthy();
    expect(report.holdsAcknowledgedById).toBe(CLINICIAN);
  });

  it('writes the reasons AS THEY STOOD into the audit entry', async () => {
    // Not a reference to the report's own holdReasons, which the next correction
    // clears. The audit has to record what the clinician was told.
    seedReport({ holdReasons: [HOLD] });
    await reviewReport('r1', true, undefined, CLINICIAN, null, true);
    const entry = auditRows().at(-1)!;
    expect(entry.action).toBe('REPORT_REVIEWED_APPROVED');
    expect(entry.metadata.acknowledgedHolds).toEqual([HOLD]);
  });

  it('lets it be SENT BACK with no acknowledgement at all', async () => {
    // Requesting changes is the correct response to a hold. Demanding a tick box
    // before somebody is allowed to say "this is not right" is the check working
    // backwards.
    seedReport({ holdReasons: [HOLD] });
    await reviewReport('r1', false, 'the panel is incomplete', CLINICIAN, null);
    expect(reportRow().status).toBe('CHANGES_REQUESTED');
  });
});

describe('nothing reaches a patient without the gate', () => {
  it('refuses to release straight from PARSED', async () => {
    seedReport();
    await expect(releaseReport('r1', CLINICIAN, null)).rejects.toThrow(ReportError);
    expect(reportRow().status).toBe('PARSED');
  });

  it('refuses to release a held report straight from PARSED as well', async () => {
    seedReport({ holdReasons: [HOLD] });
    await expect(releaseReport('r1', CLINICIAN, null)).rejects.toThrow(ReportError);
  });
});

describe('correcting a report does not advance it', () => {
  it('lands back on PARSED and clears the holds', async () => {
    // The single change that removes the second human step: verify is a
    // correction. It also clears the holds, because a person has just entered
    // every row deliberately.
    const markerId = measuredMarkerId();
    seedReport({ holdReasons: [HOLD] });
    await verifyReport(
      'r1',
      {
        sampleDate: '2026-08-01T00:00:00.000Z',
        results: [{ markerId, value: 5, unit: 'mmol/L', referenceLow: 1, referenceHigh: 9 }],
      },
      CLINICIAN,
      null,
    );
    const report = reportRow();
    expect(report.status).toBe('PARSED');
    expect(report.holdReasons).toEqual([]);
    expect(report.heldAt ?? null).toBeNull();
  });
});

describe('the one-click publish path cannot launder a hold', () => {
  const results = () => [{ markerId: measuredMarkerId(), value: 5, unit: 'mmol/L', referenceLow: 1, referenceHigh: 9 }];

  it('refuses a held report, even though verify would have cleared the holds first', async () => {
    seedReport({ holdReasons: [HOLD] });
    await expect(
      publishReport(
        'r1',
        { sampleDate: '2026-08-01T00:00:00.000Z', results: results(), confirm: true },
        CLINICIAN,
        null,
      ),
    ).rejects.toThrow(/Zorbulin/);
    // Refused BEFORE anything ran, so the report is untouched — not verified,
    // not reviewed, and its holds still on it for whoever looks next.
    const report = reportRow();
    expect(report.status).toBe('PARSED');
    expect(report.holdReasons).toEqual([HOLD]);
  });

  it('publishes a held report when the holds are acknowledged, and records them', async () => {
    seedReport({ holdReasons: [HOLD] });
    await publishReport(
      'r1',
      { sampleDate: '2026-08-01T00:00:00.000Z', results: results(), confirm: true, acknowledgeHolds: true },
      CLINICIAN,
      null,
    );
    expect(reportRow().status).toBe('RELEASED');
    const published = auditRows().find((e) => e.action === 'REPORT_PUBLISHED')!;
    // On the publish entry as well as the review one, because verify has cleared
    // the report's own reasons by the time this is written.
    expect(published.metadata.acknowledgedHolds).toEqual([HOLD]);
  });

  it('publishes a clean report with no acknowledgement and records none', async () => {
    seedReport();
    await publishReport(
      'r1',
      { sampleDate: '2026-08-01T00:00:00.000Z', results: results(), confirm: true },
      CLINICIAN,
      null,
    );
    expect(reportRow().status).toBe('RELEASED');
    const published = auditRows().find((e) => e.action === 'REPORT_PUBLISHED')!;
    expect(published.metadata.acknowledgedHolds).toBeUndefined();
  });
});
