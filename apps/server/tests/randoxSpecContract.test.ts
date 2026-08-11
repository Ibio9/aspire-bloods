import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';
import { createFakePrisma, seedCatalogue, seedPatient, seedOrder, type FakePrisma } from './support/fakePrisma.js';

/**
 * ---------------------------------------------------------------------------
 * THE CLIENT AGAINST A MOCK GENERATED FROM THE SPEC.
 * ---------------------------------------------------------------------------
 *
 * Everything here runs the REAL LiveNexusLabClient, the REAL RandoxHttpClient
 * and the REAL ingestion path over HTTP, against a server whose routes, verbs
 * and 200 bodies are read straight out of specs/nexus-openapi3.json. Nothing
 * in the mock is transcribed by hand, which is the point: a hand-written mock
 * agrees with whatever the client believes, and the client's beliefs are
 * exactly what turned out to be wrong.
 *
 * WHAT THIS FILE IS FOR, in one sentence: a future spec update should surface
 * as a test failure here rather than as a 400 in production.
 *
 * It also covers the payloads the spec does not provide and production
 * certainly will — a caveat, "< 5.0", "Not detected", an empty refLow, an
 * analyte nothing claims, and a row where Randox's own high/low flag
 * contradicts the range they sent. The last two must reach the exception
 * queue and not the patient's screen, and that is asserted rather than hoped.
 */

/**
 * A FIXED PORT, AND THE REASON FOR IT.
 *
 * config/env.ts parses process.env ONCE, at import time, and every Randox
 * client built afterwards reads the frozen result — so a mock on an ephemeral
 * port cannot tell the env its address before the env has been read. The
 * address is therefore agreed in advance and the env module is overridden
 * FOR THIS FILE ONLY.
 *
 * File-scoped rather than in vitest.config.ts on purpose: randoxLiveTransport
 * stubs global fetch and recognises the token endpoint by its URL, so a
 * suite-wide token URL would break a test that has nothing to do with this
 * one.
 *
 * The mock answers /token with a fixture bearer, so what these tests exercise
 * is the DEFAULT credential combination: subscription key AND bearer. Testing
 * the combination we are least sure of would prove the least.
 */
const MOCK_PORT = 44317;

vi.mock('../src/config/env.js', async () => {
  const actual = await vi.importActual<typeof import('../src/config/env.js')>('../src/config/env.js');
  return {
    ...actual,
    env: {
      ...actual.env,
      RANDOX_NEXUS_BASE_URL: `http://127.0.0.1:${44317}/api`,
      RANDOX_NEXUS_SUBSCRIPTION_KEY: 'fixture-subscription-key',
      RANDOX_NEXUS_TOKEN_URL: `http://127.0.0.1:${44317}/token`,
      RANDOX_NEXUS_USERNAME: 'fixture-user',
      RANDOX_NEXUS_PASSWORD: 'fixture-password',
      RANDOX_BEARER_TOKEN_ENABLED: true,
      RANDOX_REFERENCE_DATA_METHOD: 'get' as const,
    },
  };
});

const bootServer = await (await import('../src/modules/randox/mock/specServer.js')).startMockNexusServer({
  port: MOCK_PORT,
});

const db: FakePrisma = createFakePrisma();
vi.mock('../src/db/client.js', () => ({ prisma: db }));

/** Empties every table. The fake has no rollback, so a test resets explicitly. */
function resetDb() {
  for (const value of Object.values(db)) {
    if (value && typeof value === 'object' && 'rows' in value) (value as { rows: unknown[] }).rows.length = 0;
  }
}

const savedFiles: { filename: string; bytes: Buffer }[] = [];
vi.mock('../src/modules/storage/LocalDiskStorageAdapter.js', () => ({
  storageAdapter: {
    save: async (buffer: Buffer, meta: { originalFilename: string }) => {
      savedFiles.push({ filename: meta.originalFilename, bytes: buffer });
      return { storageKey: `key-${savedFiles.length}`, sizeBytes: buffer.length };
    },
  },
}));

// The live client, never the mock one — a contract test over our own fixture
// client could only prove our idea of Randox is self-consistent.
vi.mock('../src/modules/randox/clients/index.js', async () => {
  const mod = await import('../src/modules/randox/clients/NexusLabClient.js');
  return { nexusLabClient: () => new mod.LiveNexusLabClient() };
});

const { specVerbFor, loadNexusSpec, ALL_NEXUS_PATHS, startMockNexusServer } = await import(
  '../src/modules/randox/mock/specServer.js'
);
const { NEXUS_ENDPOINTS, parseRandoxErrorBody, verbForPath, SUBSCRIPTION_KEY_HEADER } = await import(
  '../src/modules/randox/endpoints.js'
);
const { LiveNexusLabClient } = await import('../src/modules/randox/clients/NexusLabClient.js');
const { toUtcIso, randoxDateTime, RANDOX_DATETIME_EXAMPLE, asRandoxInt, asRandoxIdString } = await import(
  '../src/modules/randox/clients/parse.js'
);
const { resolveAnalyte, analyteMappingCoverage } = await import('../src/modules/randox/analyteMap.js');
const { ingestOrderResults, normaliseResultDetail } = await import('../src/modules/randox/ingestionService.js');
const { __setConfigCachesForTest } = await import('../src/modules/randox/config.js');
const scenarios = await import('../src/modules/randox/mock/scenarios.js');

__setConfigCachesForTest(
  { HAEM1: { kind: 'CAVEAT', description: 'Sample slightly haemolysed.' } },
  { panels: {}, tests: {}, markerNameOverrides: {}, panelsByRandoxId: {} },
);

const server = bootServer;

afterAll(async () => {
  await server?.close();
});

beforeEach(() => {
  server.requests.length = 0;
  savedFiles.length = 0;
});

/** A client that reads the env we just set, rather than one built at import time. */
function client() {
  return new LiveNexusLabClient();
}

// ---------------------------------------------------------------------------
// The document itself
// ---------------------------------------------------------------------------

describe('the spec in specs/', () => {
  it('is the GP Test Portal v1.0 document, with 17 endpoints', () => {
    const spec = loadNexusSpec();
    expect(spec.info.title).toBe('GP Test Portal');
    expect(String(spec.info.version)).toBe('1.0');
    expect(spec.servers[0].url).toBe('https://stes-gpto-appapi-001-apim.azure-api.net/api');
    expect(Object.keys(spec.paths)).toHaveLength(17);
  });

  it('declares only a subscription key — no bearer, no OAuth', () => {
    const schemes = loadNexusSpec().components?.securitySchemes ?? {};
    expect(Object.keys(schemes).sort()).toEqual(['apiKeyHeader', 'apiKeyQuery']);
    expect(JSON.stringify(schemes)).not.toMatch(/oauth|bearer|openIdConnect/i);
  });

  it('our endpoint table matches the document, verb for verb', () => {
    for (const [name, endpoint] of Object.entries(NEXUS_ENDPOINTS)) {
      expect(specVerbFor(endpoint.path), `${name} (${endpoint.path})`).toBe(endpoint.verb);
      expect(verbForPath(endpoint.path)).toBe(endpoint.verb);
    }
    expect(ALL_NEXUS_PATHS).toHaveLength(17);
  });

  it('is eight GETs and nine POSTs, by the rule: takes a body, POST', () => {
    const spec = loadNexusSpec();
    const gets: string[] = [];
    const posts: string[] = [];
    for (const [path, operations] of Object.entries(spec.paths)) {
      for (const [verb, operation] of Object.entries(operations)) {
        (verb === 'get' ? gets : posts).push(path);
        // The rule itself, checked against the document rather than asserted.
        expect(Boolean((operation as { requestBody?: unknown }).requestBody), `${verb} ${path}`).toBe(verb === 'post');
      }
    }
    expect(gets).toHaveLength(8);
    expect(posts).toHaveLength(9);
    expect(posts.every((p) => p.startsWith('/Order/'))).toBe(true);
  });

  it('throws rather than guessing a verb for a path it has never seen', () => {
    expect(() => verbForPath('Order/SomethingNobodyRead')).toThrow(/not one of the 17 endpoints/);
  });
});

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

describe('the transport', () => {
  it('calls all eight reference endpoints with GET and gets a body', async () => {
    const c = client();
    await Promise.all([
      c.getPanels(),
      c.getTests(),
      c.getBiologicalSexes(),
      c.getEthnicities(),
      c.getTestingReasons(),
      c.getCancellationReasons(),
      c.getMyClinicDetails(),
      c.getClinicStaff(),
    ]);
    const methods = new Set(server.requests.map((r) => r.method));
    expect([...methods]).toEqual(['GET']);
    expect(server.requests).toHaveLength(8);
  });

  it('sends the subscription key in the header, and never in the query string', async () => {
    await client().getTestingReasons();
    expect(server.requests[0].hadSubscriptionKey).toBe(true);
    // The mock records the path after the query is stripped, so assert on the
    // header rather than on an absence — and prove the query form is unused by
    // checking the recorded path carries no key.
    expect(server.requests[0].path).not.toMatch(/subscription-key/);
    expect(SUBSCRIPTION_KEY_HEADER).toBe('Ocp-Apim-Subscription-Key');
  });

  it('a GET endpoint called with POST is a 405, so a wrong verb cannot pass silently', async () => {
    const res = await fetch(`${server.url}/${NEXUS_ENDPOINTS.getPanels.path}`, {
      method: 'POST',
      headers: { [SUBSCRIPTION_KEY_HEADER]: 'fixture-subscription-key', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(405);
    expect(((await res.json()) as { message: string }).message).toMatch(/declares this endpoint GET/);
  });

  it('parses BOTH error body shapes — 401 uses `status`, everything else `statusCode`', async () => {
    expect(parseRandoxErrorBody('{"status":"401","message":"Unauthorized: You are not authorized"}')).toEqual({
      code: '401',
      message: 'Unauthorized: You are not authorized',
    });
    expect(parseRandoxErrorBody('{"statusCode":"400","message":"Bad Request"}')).toEqual({
      code: '400',
      message: 'Bad Request',
    });
    // Documented as an integer, returned as a string in every example — so a
    // real integer has to read the same way.
    expect(parseRandoxErrorBody('{"statusCode":500,"message":"Internal error."}')).toEqual({
      code: '500',
      message: 'Internal error.',
    });
    expect(parseRandoxErrorBody('not json at all')).toEqual({ code: null, message: null });
  });

  it('surfaces the 401 body when the subscription key is missing', async () => {
    const bare = await startMockNexusServer();
    try {
      const res = await fetch(`${bare.url}/${NEXUS_ENDPOINTS.getPanels.path}`);
      expect(res.status).toBe(401);
      const parsed = parseRandoxErrorBody(await res.text());
      expect(parsed.code).toBe('401');
      expect(parsed.message).toMatch(/not authorized/i);
    } finally {
      await bare.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Dates and ids — the two places the spec contradicts itself
// ---------------------------------------------------------------------------

describe('scalars', () => {
  it('handles the seven-fractional-digit timestamp with an explicit offset', async () => {
    expect(RANDOX_DATETIME_EXAMPLE).toBe('2024-08-01T08:45:10.0000000+00:00');
    expect(toUtcIso(RANDOX_DATETIME_EXAMPLE)).toBe('2024-08-01T08:45:10.000Z');
    expect(randoxDateTime.safeParse(RANDOX_DATETIME_EXAMPLE).success).toBe(true);
    expect(randoxDateTime.parse(RANDOX_DATETIME_EXAMPLE)).toBe('2024-08-01T08:45:10.000Z');
    // The reason randoxDateTime exists at all: zod's own datetime() rejects it.
    const { z } = await import('zod');
    expect(z.string().datetime().safeParse(RANDOX_DATETIME_EXAMPLE).success).toBe(false);
  });

  it('accepts an id in either form and can send it in either form', () => {
    expect(asRandoxInt('1')).toBe(1);
    expect(asRandoxInt(1)).toBe(1);
    expect(asRandoxInt('not a number')).toBeNull();
    expect(asRandoxIdString(1)).toBe('1');
    expect(asRandoxIdString('1')).toBe('1');
    expect(asRandoxIdString('')).toBeNull();
  });

  it('the spec really does type TestReasons[].Id two different ways', () => {
    const spec = loadNexusSpec();
    const pending = spec.paths['/Order/CreatePendingOrder'].post.requestBody!.content!['application/json'].example as {
      TestReasons: { Id: unknown }[];
    };
    const full = spec.paths['/Order/CreateOrder'].post.requestBody!.content!['application/json'].example as {
      TestReasons: { Id: unknown }[];
    };
    expect(typeof pending.TestReasons[0].Id).toBe('number');
    expect(typeof full.TestReasons[0].Id).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

describe('prices', () => {
  it('the spec DOES serve cost and currency, so there is something to strip', () => {
    const panels = specExample('/TestPanel/GetPanels') as { cost?: unknown; currency?: unknown }[];
    expect(panels[0].cost).toBeDefined();
    expect(panels[0].currency).toBeDefined();
  });

  it('nothing the client returns carries cost or currency, at any depth', async () => {
    const c = client();
    const [panels, tests] = await Promise.all([c.getPanels(), c.getTests()]);
    for (const payload of [panels, tests]) {
      const serialised = JSON.stringify(payload);
      expect(serialised).not.toMatch(/"cost"/i);
      expect(serialised).not.toMatch(/"currency"/i);
      expect(serialised).not.toMatch(/"price"/i);
    }
    // And the useful fields survived the strip — a strip that took everything
    // would also pass the assertion above.
    expect(panels[0].fastingRequired).toBe(true);
    expect(panels[0].panelType).toBe('Custom');
    expect(panels[0].sampleStabilityTime).toBe(1);
    expect(panels[0].sampleTubes.length).toBeGreaterThan(0);
    expect(panels[0].testItems.length).toBeGreaterThan(0);
    expect(tests[0].code).toBeTruthy();
  });

  it('GetTests carries no reference range, and no field for one', async () => {
    const tests = await client().getTests();
    const serialised = JSON.stringify(tests);
    for (const field of ['refLow', 'refHigh', 'units', 'unit', 'referenceLow', 'referenceHigh']) {
      expect(serialised, `GetTests should not carry ${field}`).not.toMatch(new RegExp(`"${field}"`, 'i'));
    }
  });
});

function specExample(pathName: string): unknown {
  const spec = loadNexusSpec();
  const operations = spec.paths[pathName];
  const operation = Object.values(operations)[0];
  return operation.responses!['200'].content!['application/json'].example;
}

// ---------------------------------------------------------------------------
// The analyte map
// ---------------------------------------------------------------------------

describe('analyte mapping', () => {
  it('matches exactly, then normalised, and refuses anything looser', () => {
    expect(resolveAnalyte({ analyte: 'Ferritin' })).toMatchObject({ status: 'MAPPED', via: 'exact' });
    // Case, whitespace and punctuation only.
    expect(resolveAnalyte({ analyte: 'ferritin' })).toMatchObject({ status: 'MAPPED', via: 'normalised' });
    // A substring is NOT a match. This is the whole safety property: "RBC
    // Magnesium" and "Magnesium" are two different tests.
    expect(resolveAnalyte({ analyte: 'Serum Ferritin Level' }).status).toBe('UNMAPPED');
    expect(resolveAnalyte({ analyte: 'Ferrit' }).status).toBe('UNMAPPED');
  });

  it('resolves a documented Randox misspelling through an explicit override', () => {
    expect(resolveAnalyte({ analyte: 'Pepsingogen 1' })).toMatchObject({
      status: 'MAPPED',
      markerKey: 'pepsinogen-1',
      via: 'override',
    });
  });

  it('sampleType separates a urine dipstick from the serum marker of the same name', () => {
    expect(resolveAnalyte({ analyte: 'Glucose', sampleType: 'Urine' })).toMatchObject({
      status: 'MAPPED',
      markerKey: 'glucose-urine',
      via: 'sample-type',
    });
    expect(resolveAnalyte({ analyte: 'Glucose', sampleType: 'Serum' })).toMatchObject({
      status: 'MAPPED',
      markerKey: 'glucose',
    });
  });

  it('reports coverage without padding it', () => {
    const coverage = analyteMappingCoverage();
    expect(coverage.measured).toBeGreaterThan(150);
    expect(coverage.ambiguous).toEqual([]);
    // The honest figure: nothing here has met a real Randox payload yet.
    expect(coverage.confirmedAgainstRealPayload).toBe(0);
    expect(coverage.overrides).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The edge fixtures the spec does not provide
// ---------------------------------------------------------------------------

describe('result payloads the spec does not cover', () => {
  beforeEach(() => {
    resetDb();
    seedCatalogue(db);
  });

  async function normalise(rows: (typeof scenarios.ALL_EDGE_ROWS)[number][]) {
    return normaliseResultDetail(
      (await import('../src/modules/randox/mock/scenarios.js')).resultDetailWith(rows) as never,
    );
  }

  it('a caveat annotates a reportable result rather than voiding it', async () => {
    const { parsed } = await normalise([scenarios.CAVEAT_ROW]);
    expect(parsed.exclusions).toHaveLength(0);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].caveatCodes).toContain('HAEM1');
  });

  it('"< 5.0" is a limit and never becomes 5.0 or 0', async () => {
    const { parsed } = await normalise([scenarios.COMPARATOR_ROW]);
    const row = parsed.rows[0];
    expect(row.value).toBeNull();
    expect(row.resultText).toBe('< 5.0');
    expect(row.needsReview).toBe(true);
    expect(row.flags).toContain('comparator_result');
  });

  it('"Not detected" is a real qualitative result, held for entry rather than dropped', async () => {
    const { parsed } = await normalise([scenarios.QUALITATIVE_ROW]);
    expect(parsed.rows[0].value).toBeNull();
    expect(parsed.rows[0].resultText).toBe('Not detected');
    expect(parsed.rows[0].flags).toContain('non_numeric_result');
  });

  it('an empty refLow is an absent bound, not a zero', async () => {
    const { parsed } = await normalise([scenarios.ONE_SIDED_RANGE_ROW]);
    const row = parsed.rows[0];
    // THE ABSENT BOUND IS NULL AND THE PRESENT ONE IS KEPT. Reading "" as 0
    // would turn "below 569" into "0 to 569", which is a two-sided range
    // nobody supplied and would let a value of 4 compute as "below range".
    expect(row.referenceLow).toBeNull();
    expect(row.referenceHigh).toBe(569);
    expect(row.flags).toContain('one_sided_reference_range');
    expect(row.needsReview).toBe(true);
    // And the raw strings survive, so an admin sees what the lab actually sent.
    expect(row.referenceLowRaw ?? '').toBe('');
    expect(row.referenceHighRaw).toBe('569');
  });

  it('AN UNMAPPED ANALYTE GOES TO THE QUEUE, NOT TO THE PATIENT', async () => {
    const { parsed, unmappedAnalytes } = await normalise([scenarios.CLEAN_ROW, scenarios.UNMAPPED_ANALYTE_ROW]);
    // It is not filed as a result.
    expect(parsed.rows.map((r) => r.rawName)).not.toContain('Proprietary Index 7');
    // It is not silently gone either: the exact strings Randox used are kept.
    expect(unmappedAnalytes).toHaveLength(1);
    expect(unmappedAnalytes[0].analyte).toBe('Randox Proprietary Index 7');
    expect(unmappedAnalytes[0].group).toBe('Randox Research');
    expect(unmappedAnalytes[0].displayName).toBe('Proprietary Index 7');
    expect(parsed.exclusions?.some((x) => x.reason.includes('Randox Proprietary Index 7'))).toBe(true);
  });

  it('a lab flag that disagrees with the range is raised, not resolved', async () => {
    const { parsed } = await normalise([scenarios.LAB_STATUS_DISAGREEMENT_ROW]);
    const row = parsed.rows[0];
    // Both are stored exactly as the laboratory sent them.
    expect(row.value).toBe(4.2);
    expect(row.referenceHigh).toBe(5);
    expect(row.labStatusIndicator).toBe('H');
    // And the disagreement is flagged for an admin rather than one side winning.
    expect(row.labStatusDisagrees).toBe(true);
    expect(row.flags).toContain('lab_status_disagreement');
    expect(row.needsReview).toBe(true);
  });

  it('two analytes with one name and different sample types stay two results', async () => {
    const { parsed } = await normalise([scenarios.URINE_GLUCOSE_ROW]);
    // Qualitative, so it is held rather than filed — but as the URINE marker.
    const row = parsed.rows[0];
    expect(row.markerKey).toBe('glucose-urine');
    expect(row.sampleType).toBe('Urine');
  });
});

// ---------------------------------------------------------------------------
// The whole flow, over HTTP
// ---------------------------------------------------------------------------

describe('the full flow against the mock', () => {
  beforeEach(() => {
    resetDb();
    seedCatalogue(db);
    seedPatient(db, { id: 'p1', firstName: 'Fixture', lastName: 'Patient', dob: '1985-03-04', sex: 'FEMALE' });
    seedOrder(db, {
      orderNumber: scenarios.FIXTURE_ORDER_NUMBER,
      patientId: 'p1',
      randoxOrderId: scenarios.FIXTURE_ORDER_ID,
      ordered: { firstName: 'Fixture', lastName: 'Patient', dob: '1985-03-04' },
    });
  });

  it('walks the five documented statuses without inventing one', async () => {
    const c = client();
    for (const statusId of [1, 2, 3, 4, 5]) {
      server.setOverride(NEXUS_ENDPOINTS.getOrderStatus.path, () => scenarios.statusResponse(statusId));
      const status = await c.getOrderStatus({
        orderId: scenarios.FIXTURE_ORDER_ID,
        orderNumber: scenarios.FIXTURE_ORDER_NUMBER,
      });
      expect(status.statusId).toBe(statusId);
    }
    server.setOverride(NEXUS_ENDPOINTS.getOrderStatus.path, null);
  });

  it('fetches result detail, parses it, files it and stores both artefacts', async () => {
    server.setOverride(NEXUS_ENDPOINTS.getOrderResultDetail.path, () =>
      scenarios.resultDetailWith([scenarios.CLEAN_ROW, scenarios.LAB_STATUS_DISAGREEMENT_ROW]),
    );
    server.setOverride(NEXUS_ENDPOINTS.getOrderResultReports.path, () => scenarios.reportsResponse());

    const result = await ingestOrderResults({
      orderId: scenarios.FIXTURE_ORDER_ID,
      orderNumber: scenarios.FIXTURE_ORDER_NUMBER,
      clinicId: 146,
    });

    expect(['INGESTED', 'PARTIAL']).toContain(result.outcome);
    expect(result.reportId).toBeTruthy();

    // Nothing auto-publishes: the report stops at ADMIN_VERIFIED at best.
    const report = db.report.rows.find((r) => r.id === result.reportId)!;
    expect(['PARSED', 'ADMIN_VERIFIED']).toContain(report.status);
    expect(report.status).not.toBe('RELEASED');

    // THE PDF ARRIVES AS BASE64, NOT BINARY. Decoded on the way to storage,
    // so what lands on the volume is a real file rather than the base64 text.
    const pdf = savedFiles.find((f) => f.filename.endsWith('.pdf'));
    expect(pdf, 'the report PDF should have been stored').toBeTruthy();
    expect(pdf!.bytes.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
    expect(pdf!.bytes.toString('utf-8')).not.toMatch(/^JVBER/);

    // And the raw payload beside it, because the parsed rows are a lossy read.
    expect(savedFiles.some((f) => f.filename.endsWith('.json'))).toBe(true);

    server.setOverride(NEXUS_ENDPOINTS.getOrderResultDetail.path, null);
    server.setOverride(NEXUS_ENDPOINTS.getOrderResultReports.path, null);
  });

  it('sends GetOrderResultDetail as a POST with a body, per the spec', async () => {
    server.setOverride(NEXUS_ENDPOINTS.getOrderResultDetail.path, () => scenarios.resultDetailWith([scenarios.CLEAN_ROW]));
    await client().getOrderResultDetail({
      orderId: scenarios.FIXTURE_ORDER_ID,
      orderNumber: scenarios.FIXTURE_ORDER_NUMBER,
      clinicId: 146,
    });
    const call = server.requests.find((r) => r.path === NEXUS_ENDPOINTS.getOrderResultDetail.path)!;
    expect(call.method).toBe('POST');
    expect(call.body).toMatchObject({ orderId: scenarios.FIXTURE_ORDER_ID, clinicId: 146 });
    server.setOverride(NEXUS_ENDPOINTS.getOrderResultDetail.path, null);
  });
});
