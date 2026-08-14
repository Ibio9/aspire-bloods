import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakePrisma, seedCatalogue, seedPatient, type FakePrisma } from './support/fakePrisma.js';

/**
 * ---------------------------------------------------------------------------
 * AUTOMATIC RELEASE, AND THE THREE THINGS THAT NOW CARRY THE WEIGHT.
 * ---------------------------------------------------------------------------
 *
 * This file used to be clinicianGate.test.ts and its subject was "nothing
 * reaches a patient without a clinician having said so". That guarantee has been
 * deliberately given up: a patient not seeing their own abnormal result is worse
 * than them seeing it, and a result sitting in a queue nobody opens is the real
 * risk.
 *
 * What is left has to be tested over the real service functions rather than over
 * the transition table, because the table cannot see a hold and cannot see the
 * order two side effects happen in:
 *
 *  1. A HELD REPORT IS REFUSED, to automation and to a person alike, until the
 *     reasons are acknowledged — and the acknowledgement is stamped and audited.
 *  2. ESCALATION FIRES BEFORE THE STATUS WRITE. With no gate, the patient and
 *     the clinic learn at the same moment, so the clinic's mail must be out
 *     before the report is visible. This is an ORDER, which is exactly the kind
 *     of thing that is true today and quietly false after a refactor.
 *  3. A FAILED ESCALATION DOES NOT BLOCK THE RELEASE. The mail provider does not
 *     get a veto over whether somebody can see their own results.
 *
 * Plus the publish path, which could always launder a hold by running verify
 * first, and still cannot.
 */

const db: FakePrisma = createFakePrisma();
vi.mock('../src/db/client.js', () => ({ prisma: db }));

/**
 * Escalation is mocked so this file can watch WHEN it is called rather than what
 * it sends. `seenStatusAtEscalation` is the whole point: it reads the report row
 * at the moment escalation runs, so "before the write" is measured rather than
 * assumed from the order of two lines in a function.
 */
const escalationCalls: { reportId: string; seenStatusAtEscalation: string }[] = [];
let escalationThrows = false;
vi.mock('../src/modules/escalation/service.js', () => ({
  checkAndEscalate: vi.fn(async (reportId: string) => {
    escalationCalls.push({
      reportId,
      seenStatusAtEscalation: (db.report.rows.find((r) => r.id === reportId)?.status as string) ?? 'MISSING',
    });
    if (escalationThrows) throw new Error('Resend email send failed: service unavailable');
    return { escalated: true, severity: 'MILD' as const, flaggedCount: 1, significantCount: 0, channels: ['EMAIL'] };
  }),
}));

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
  releasedAt: Date | null;
  holdReasons: string[];
  heldAt: Date | null;
  holdsAcknowledgedAt: Date | null;
  holdsAcknowledgedById: string | null;
}
const reportRow = () => db.report.rows[0] as unknown as ReportRow;

interface AuditRow {
  action: string;
  actorType: string;
  actorUserId: string | null;
  metadata: {
    acknowledgedHolds?: string[];
    releasedWithAcknowledgedHolds?: string[];
    automatic?: boolean;
    escalatedBeforeRelease?: boolean;
  };
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
    releasedAt: null,
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
  escalationCalls.length = 0;
  escalationThrows = false;
});

describe('a clean report releases with nobody in the loop', () => {
  it('releases straight from PARSED with no actor at all', async () => {
    seedReport();
    // No actorUserId. This is the call materialiseParsedReport makes.
    await releaseReport('r1', null, null);
    const report = reportRow();
    expect(report.status).toBe('RELEASED');
    expect(report.releasedAt).toBeTruthy();
  });

  it('audits it as SYSTEM and says in as many words that it was automatic', async () => {
    // "Nobody pressed anything" is the single most important fact about a
    // release now, and an audit log that cannot answer it cannot answer how this
    // practice operates.
    seedReport();
    await releaseReport('r1', null, null);
    const entry = auditRows().find((e) => e.action === 'REPORT_RELEASED')!;
    expect(entry.actorType).toBe('SYSTEM');
    expect(entry.actorUserId).toBeNull();
    expect(entry.metadata.automatic).toBe(true);
  });

  it('records a human release as NOT automatic', async () => {
    seedReport();
    await releaseReport('r1', CLINICIAN, null);
    const entry = auditRows().find((e) => e.action === 'REPORT_RELEASED')!;
    expect(entry.actorType).toBe('USER');
    expect(entry.metadata.automatic).toBe(false);
  });

  it('cannot be released twice, which is what keeps escalation exactly-once', async () => {
    seedReport();
    await releaseReport('r1', null, null);
    await expect(releaseReport('r1', null, null)).rejects.toThrow(ReportError);
    expect(escalationCalls).toHaveLength(1);
  });
});

describe('escalation fires before the release commits', () => {
  it('sees the report still at PARSED when it runs', async () => {
    // The measurement, not the claim. If somebody moves the escalation call
    // below the status write, this reads RELEASED and fails.
    seedReport();
    await releaseReport('r1', null, null);
    expect(escalationCalls).toEqual([{ reportId: 'r1', seenStatusAtEscalation: 'PARSED' }]);
    expect(reportRow().status).toBe('RELEASED');
  });

  it('records on the release entry that it went out first', async () => {
    seedReport();
    await releaseReport('r1', null, null);
    const entry = auditRows().find((e) => e.action === 'REPORT_RELEASED')!;
    expect(entry.metadata.escalatedBeforeRelease).toBe(true);
  });

  it('releases anyway when the mail provider is down, and audits the failure', async () => {
    // A third party does not get a veto over whether somebody can see their own
    // results — that is the failure mode this whole change exists to remove.
    seedReport();
    escalationThrows = true;
    await releaseReport('r1', null, null);
    expect(reportRow().status).toBe('RELEASED');
    expect(auditRows().some((e) => e.action === 'ESCALATION_FAILED')).toBe(true);
  });
});

describe('a held report is refused, to everybody', () => {
  it('refuses an automatic release outright', async () => {
    // Automation cannot reach this in practice (materialiseParsedReport only
    // calls when the parse was clean), and the refusal is here so that a future
    // caller that gets it wrong is stopped rather than trusted.
    seedReport({ holdReasons: [HOLD] });
    await expect(releaseReport('r1', null, null)).rejects.toThrow(ReportError);
    expect(reportRow().status).toBe('PARSED');
    // And nothing was sent about a report that did not go out.
    expect(escalationCalls).toHaveLength(0);
  });

  it('refuses a human release without the acknowledgement, naming the reason', async () => {
    seedReport({ holdReasons: [HOLD] });
    await expect(releaseReport('r1', CLINICIAN, null)).rejects.toThrow(/Zorbulin/);
  });

  it('releases with the acknowledgement, and stamps who acknowledged', async () => {
    seedReport({ holdReasons: [HOLD] });
    await releaseReport('r1', CLINICIAN, null, { acknowledgeHolds: true });
    const report = reportRow();
    expect(report.status).toBe('RELEASED');
    expect(report.holdsAcknowledgedById).toBe(CLINICIAN);
    const entry = auditRows().find((e) => e.action === 'REPORT_RELEASED')!;
    expect(entry.metadata.releasedWithAcknowledgedHolds).toEqual([HOLD]);
  });
});

describe('review is what a person does about a held report', () => {
  it('approving a held report acknowledges, audits and releases in one action', async () => {
    seedReport({ holdReasons: [HOLD] });
    await reviewReport('r1', true, undefined, CLINICIAN, null, true);
    const report = reportRow();
    expect(report.status).toBe('RELEASED');
    expect(report.reviewedById).toBe(CLINICIAN);
    expect(report.holdsAcknowledgedById).toBe(CLINICIAN);
  });

  it('writes the reasons AS THEY STOOD into the review entry', async () => {
    // Not a reference to the report's own holdReasons, which the next correction
    // clears. The audit has to record what the clinician was told.
    seedReport({ holdReasons: [HOLD] });
    await reviewReport('r1', true, undefined, CLINICIAN, null, true);
    const entry = auditRows().find((e) => e.action === 'REPORT_REVIEWED_APPROVED')!;
    expect(entry.metadata.acknowledgedHolds).toEqual([HOLD]);
  });

  it('refuses to approve a held report without the acknowledgement', async () => {
    seedReport({ holdReasons: [HOLD] });
    await expect(reviewReport('r1', true, undefined, CLINICIAN, null)).rejects.toThrow(/Zorbulin/);
    // And the report did not move. A refusal that left it half-advanced would be
    // worse than the bypass.
    expect(reportRow().status).toBe('PARSED');
  });

  it('lets it be SENT BACK with no acknowledgement at all', async () => {
    // Requesting changes is the correct response to a hold. Demanding a tick box
    // before somebody is allowed to say "this is not right" is the check working
    // backwards.
    seedReport({ holdReasons: [HOLD] });
    await reviewReport('r1', false, 'the panel is incomplete', CLINICIAN, null);
    expect(reportRow().status).toBe('CHANGES_REQUESTED');
    expect(escalationCalls).toHaveLength(0);
  });

  it('does not stamp an acknowledgement on a clean report', async () => {
    // An acknowledgement on every report is an acknowledgement that means
    // nothing on the ones that need it.
    seedReport();
    await reviewReport('r1', true, undefined, CLINICIAN, null);
    expect(reportRow().status).toBe('RELEASED');
    expect(reportRow().holdsAcknowledgedAt ?? null).toBeNull();
  });
});

describe('correcting a report does not release it', () => {
  it('lands back on PARSED and clears the holds', async () => {
    // verify is a correction. It also clears the holds, because a person has
    // just entered every row deliberately — and it does NOT release, because
    // saving a form is not the same act as sending it.
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
    expect(escalationCalls).toHaveLength(0);
  });
});

describe('the one-step publish path cannot launder a hold', () => {
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
    // not released, and its holds still on it for whoever looks next.
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
    // On the publish entry, because verify has cleared the report's own reasons
    // by the time this is written.
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
