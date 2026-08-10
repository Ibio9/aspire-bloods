import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakePrisma, seedCatalogue, seedPatient, seedOrder, type FakePrisma } from './support/fakePrisma.js';

/**
 * ---------------------------------------------------------------------------
 * The LIVE transport, over a stubbed socket.
 * ---------------------------------------------------------------------------
 *
 * Everything else in this suite exercises the mock client, which is the right
 * thing to build a lifecycle on and the wrong thing to prove a contract with:
 * the mock is our own idea of what Randox do, so a test over it can only
 * confirm that our idea is self-consistent.
 *
 * This file replaces `fetch` instead. What runs is the real
 * LiveNexusLabClient, the real RandoxHttpClient, the real B2C token client
 * and the real ingestion path — against bytes shaped like the ones in
 * specs/nexus-openapi.json. It is the only place that can answer questions
 * about wire behaviour: which verb goes out, which headers, what happens on a
 * 429, and whether a voided result gets as far as a ReportResult row when
 * nothing in the chain is pretending.
 */

const db: FakePrisma = createFakePrisma();
vi.mock('../src/db/client.js', () => ({ prisma: db }));
vi.mock('../src/modules/storage/LocalDiskStorageAdapter.js', () => ({
  storageAdapter: { save: async () => ({ storageKey: 'k', sizeBytes: 1 }) },
}));

/**
 * The transport selector reads RANDOX_TRANSPORT, which is 'mock' everywhere
 * except production. Forced to the live client here — running these
 * assertions against the mock would be the exact mistake this file exists to
 * avoid.
 */
vi.mock('../src/modules/randox/clients/index.js', async () => {
  const mod = await import('../src/modules/randox/clients/NexusLabClient.js');
  let client: InstanceType<typeof mod.LiveNexusLabClient> | null = null;
  return { nexusLabClient: () => (client ??= new mod.LiveNexusLabClient()) };
});

const { LiveNexusLabClient } = await import('../src/modules/randox/clients/NexusLabClient.js');
const { RandoxHttpClient, parseRetryAfter } = await import('../src/modules/randox/http/RandoxHttpClient.js');
const { ingestOrderResults } = await import('../src/modules/randox/ingestionService.js');
const { __setConfigCachesForTest } = await import('../src/modules/randox/config.js');

__setConfigCachesForTest(
  { 'HB-DIL': { kind: 'CAVEAT', description: 'Sample diluted before analysis.' } },
  { panels: {}, tests: {}, markerNameOverrides: {}, panelsByRandoxId: {} },
);

// ---------------------------------------------------------------------------
// A fake gateway
// ---------------------------------------------------------------------------

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let calls: Call[] = [];
/** Queued responses, consumed in order. Falls back to `defaultResponder`. */
let queued: (() => Response)[] = [];
let defaultResponder: (call: Call) => Response = () => json({});

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function installFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      // The token endpoint. Answered first and separately, because every
      // other call needs a bearer before it can be made at all.
      if (url.includes('/oauth2/v2.0/token')) {
        return json({ access_token: 'tok-abc', expires_in: 3600, token_type: 'Bearer' });
      }
      const call: Call = {
        url,
        method: init?.method ?? 'GET',
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      const next = queued.shift();
      return next ? next() : defaultResponder(call);
    }),
  );
}

beforeEach(() => {
  calls = [];
  queued = [];
  defaultResponder = () => json({});
  for (const key of Object.keys(db) as (keyof FakePrisma)[]) {
    const table = db[key] as { rows?: unknown[] };
    if (table && Array.isArray(table.rows)) table.rows = [];
  }
  seedCatalogue(db);
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

/** A result payload in the shape the spec's own example declares. */
function resultDetail(orderNumber: string, rows: Record<string, unknown>[]) {
  return {
    orderId: 91,
    orderNumber,
    orderCreatedDate: '2026-08-01T08:45:10.0000000+00:00',
    sampleCollectionDate: '2026-08-02T08:45:10.0000000+00:00',
    sampleAccessioningDate: '2026-08-02T16:45:10.0000000+00:00',
    sampleCancellationDate: null,
    resultsUploadDate: '2026-08-03T08:45:10.0000000+00:00',
    reportResults: rows,
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
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    orderNumber: 'GC1123-900',
    // Europe/London wall-clock, per the endpoint's own description. Not UTC.
    dateOfReceipt: '2026-08-02T09:00:00',
    dateOfReport: '2026-08-03T09:00:00',
    analyte: 'Haemoglobin',
    group: 'Full Blood Count',
    // Strings. All three of them, as the spec types them.
    result: '145',
    units: 'g/L',
    refLow: '130',
    refHigh: '170',
    lowHigh: '',
    sampleType: 'Whole Blood',
    caveat: null,
    displayName: 'Haemoglobin',
    ...overrides,
  };
}

describe('the wire', () => {
  it('sends the bearer token and the subscription key on every request', async () => {
    const client = new LiveNexusLabClient();
    defaultResponder = () => json({ statusId: 4, orderNumber: 'GC1123-900', orderId: 91 });

    await client.getOrderStatus({ orderId: 91, orderNumber: 'GC1123-900' });

    expect(calls).toHaveLength(1);
    expect(calls[0].headers.Authorization).toBe('Bearer tok-abc');
    expect(calls[0].headers['Ocp-Apim-Subscription-Key']).toBeDefined();
  });

  it('posts to every /Order endpoint, including the Get* ones', async () => {
    const client = new LiveNexusLabClient();

    defaultResponder = () => json({ statusId: 3, orderNumber: 'GC1123-900', orderId: 91 });
    await client.getOrderStatus({ orderId: 91, orderNumber: 'GC1123-900' });

    defaultResponder = () => json(resultDetail('GC1123-900', [row()]));
    await client.getOrderResultDetail({ orderId: 91, orderNumber: 'GC1123-900', clinicId: 146 });

    defaultResponder = () => json({ reportResults: null });
    await client.getOrderResultReports({ orderId: 91, orderNumber: 'GC1123-900', clinicId: 146 });

    expect(calls.map((c) => c.method)).toEqual(['POST', 'POST', 'POST']);
    expect(calls.map((c) => new URL(c.url).pathname.split('/').pop())).toEqual([
      'GetOrderStatus',
      'GetOrderResultDetail',
      'GetOrderResultReports',
    ]);
  });

  it('falls back to POST when a reference endpoint refuses GET, and remembers', async () => {
    const client = new LiveNexusLabClient();
    // The disagreement this exists for: the spec declares these GET, Randox
    // say everything is POST. Being wrong is seven endpoints answering 405.
    queued = [() => new Response('', { status: 405 }), () => json({ items: [{ id: '1', name: 'Male' }] })];
    defaultResponder = () => json({ items: [{ id: '1', name: 'Male' }] });

    const first = await client.getBiologicalSexes();
    expect(first).toEqual([{ id: '1', name: 'Male' }]);
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST']);

    // Second call goes straight to the verb that worked — no re-probing.
    await client.getBiologicalSexes();
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST', 'POST']);
  });

  it('does not turn a 500 on a reference endpoint into a second request', async () => {
    const client = new LiveNexusLabClient();
    // A server error is a real error. Retrying it as a different verb would
    // paper over an outage and double the load causing it. (One retry from
    // the transient-retry budget is expected; a verb change is not.)
    defaultResponder = () => new Response('boom', { status: 500 });

    await expect(client.getEthnicities()).rejects.toThrow();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });
});

describe('when Randox are slow or down', () => {
  it('retries a 503 and succeeds, rather than losing the call', async () => {
    const http = new RandoxHttpClient({
      label: 'Test',
      baseUrl: 'https://example.test/api',
      clientId: 'c',
      scope: 's',
      subscriptionKey: 'k',
      tokenUrl: 'https://example.test/oauth2/v2.0/token',
      username: 'u',
      password: 'p',
    });

    queued = [() => new Response('', { status: 503 }), () => json({ ok: true })];
    const result = await http.request<{ ok: boolean }>('Order/GetOrderStatus', { method: 'POST', body: {} });

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('honours Retry-After on a 429 instead of hammering', async () => {
    const http = new RandoxHttpClient({
      label: 'Test',
      baseUrl: 'https://example.test/api',
      clientId: 'c',
      scope: 's',
      subscriptionKey: 'k',
      tokenUrl: 'https://example.test/oauth2/v2.0/token',
      username: 'u',
      password: 'p',
    });

    queued = [
      () => new Response('', { status: 429, headers: { 'retry-after': '0' } }),
      () => json({ ok: true }),
    ];
    const started = Date.now();
    await http.request('Order/GetOrderStatus', { method: 'POST', body: {} });

    expect(calls).toHaveLength(2);
    // Retry-After: 0 means "now"; the point is that the header was READ, not
    // that the wait was long. A test that asserted a real delay would be a
    // test that takes that long to run.
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('never repeats CreatePendingOrder — a retried create is a second real order', async () => {
    const client = new LiveNexusLabClient();
    defaultResponder = () => new Response('', { status: 502 });

    await expect(
      client.createPendingOrder({
        FirstName: 'Aisha',
        LastName: 'Khan',
        DateOfBirth: '1988-04-12',
        BiologicalSexId: 2,
        TestClinicLocationId: 146,
        PanelIds: [71],
        TestIds: [],
        IsHealthCheckPanelReport: true,
        IsCvScoreRequired: false,
        TestReasons: [{ Id: 1, Details: 'Screening' }],
      }),
    ).rejects.toThrow();

    expect(calls, 'a failed create is not retried; a human decides').toHaveLength(1);
  });

  it('reads Retry-After in both the forms the spec permits', () => {
    expect(parseRetryAfter('30')).toBe(30_000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('not a number at all')).toBeNull();
    const inTen = new Date(Date.now() + 10_000).toUTCString();
    expect(parseRetryAfter(inTen)).toBeGreaterThan(5_000);
  });
});

describe('a voided result, through the live path', () => {
  it('produces no ReportResult row at all', async () => {
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    seedOrder(db, {
      orderNumber: 'GC1123-900',
      patientId: 'p1',
      randoxOrderId: 91,
      ordered: { firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' },
    });

    // Two analytes. One reportable, one carrying a code the configured map
    // does not recognise — which voids it, because unknown-means-void is the
    // intended direction of failure while the real code list is outstanding.
    defaultResponder = (call) =>
      call.url.includes('GetOrderResultReports')
        ? json({ reportResults: null })
        : json(
            resultDetail('GC1123-900', [
              row(),
              row({ analyte: 'Ferritin', displayName: 'Ferritin', result: '60', units: 'ug/L', refLow: '30', refHigh: '400', caveat: 'XYZ-NOT-IN-MAP' }),
            ]),
          );

    const outcome = await ingestOrderResults({ orderId: 91, orderNumber: 'GC1123-900', clinicId: 146 });

    expect(outcome.outcome).toBe('INGESTED');
    expect(db.reportResult.rows).toHaveLength(1);
    expect(db.reportResult.rows[0].markerId).toBe('marker-haemoglobin');
    expect(
      db.reportResult.rows.some((r) => r.markerId === 'marker-ferritin'),
      'a voided analyte must never become a result row',
    ).toBe(false);
    // Recorded as withheld rather than silently missing.
    expect(db.reportResultExclusion.rows.map((x) => x.rawMarkerName)).toEqual(['Ferritin']);
  });

  it('creates no report when the whole order was voided', async () => {
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    seedOrder(db, {
      orderNumber: 'GC1123-901',
      patientId: 'p1',
      randoxOrderId: 92,
      ordered: { firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' },
    });

    defaultResponder = () =>
      json(resultDetail('GC1123-901', [row({ caveat: 'XYZ-NOT-IN-MAP' })]));

    const outcome = await ingestOrderResults({ orderId: 92, orderNumber: 'GC1123-901', clinicId: 146 });

    expect(outcome.outcome).toBe('ALL_VOIDED');
    expect(db.report.rows).toHaveLength(0);
    expect(db.reportResult.rows).toHaveLength(0);
  });

  it('keeps "< 5.0" and "Not detected" out of the numeric column', async () => {
    seedPatient(db, { id: 'p1', firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' });
    seedOrder(db, {
      orderNumber: 'GC1123-902',
      patientId: 'p1',
      randoxOrderId: 93,
      ordered: { firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' },
    });

    defaultResponder = (call) =>
      call.url.includes('GetOrderResultReports')
        ? json({ reportResults: null })
        : json(
            resultDetail('GC1123-902', [
              row(),
              row({ analyte: 'Ferritin', displayName: 'Ferritin', result: '< 5.0', units: 'ug/L' }),
              row({ analyte: 'Vitamin D', displayName: 'Vitamin D', result: 'Not detected', units: 'nmol/L' }),
            ]),
          );

    await ingestOrderResults({ orderId: 93, orderNumber: 'GC1123-902', clinicId: 146 });

    // Neither becomes a number. "<5.0" is not 5.0 and is not 0, so neither
    // reaches the results table; both are held for an admin instead.
    expect(db.reportResult.rows.map((r) => r.markerId)).toEqual(['marker-haemoglobin']);
    expect(db.report.rows[0].status, 'a delivery with unfiled results waits for an admin').toBe('PARSED');
  });

  it('reads the two Europe/London dates as London, and everything else as UTC', async () => {
    const client = new LiveNexusLabClient();
    defaultResponder = () => json(resultDetail('GC1123-903', [row()]));

    const detail = await client.getOrderResultDetail({ orderId: 94, orderNumber: 'GC1123-903', clinicId: 146 });

    // 2026-08-02T09:00:00 London is BST, so 08:00Z. Treating it as UTC would
    // put a sample-receipt an hour out, and at a day boundary a day out.
    expect(detail.reportResults[0].dateOfReceipt).toBe('2026-08-02T08:00:00.000Z');
    // The order-level timestamps carry their own offset and are already UTC.
    expect(detail.sampleCollectionDate).toBe('2026-08-02T08:45:10.000Z');
  });
});
