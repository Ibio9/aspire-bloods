import { encryptField } from '../../src/lib/crypto.js';

/**
 * Enough of Prisma to run a whole ingestion end to end in memory.
 *
 * Written rather than mocked call-by-call because the questions these tests
 * ask are about OUTCOMES across several tables at once — "did a ReportResult
 * row appear", "did the report stop at PARSED", "was an audit entry written
 * naming the evidence". A per-call `vi.fn()` mock can only assert that a
 * function was called with an argument, which is a test of the code's
 * spelling, not of what it did. Two patients with the same name being
 * impossible to confuse is not a claim about a call site.
 *
 * Deliberately narrow: it implements the methods this path actually uses and
 * throws loudly on anything else, so a change that starts touching a new
 * table fails here rather than silently no-opping.
 */

export interface FakeRow {
  id: string;
  [key: string]: unknown;
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

/** Shallow match of a Prisma `where` against a row. Enough for unique lookups. */
function matches(row: FakeRow, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (expected === undefined) continue;
    const actual = row[key];
    if (expected !== null && typeof expected === 'object') {
      const clause = expected as Record<string, unknown>;
      if ('in' in clause) {
        if (!(clause.in as unknown[]).includes(actual)) return false;
        continue;
      }
      if ('not' in clause) {
        if (actual === clause.not) return false;
        continue;
      }
      if ('equals' in clause) {
        if (actual !== clause.equals) return false;
        continue;
      }
      // A compound unique (reportId_markerId) arrives as a nested object.
      let all = true;
      for (const [k, v] of Object.entries(clause)) {
        if (row[k] !== v) all = false;
      }
      if (!all) return false;
      continue;
    }
    if (actual !== expected) return false;
  }
  return true;
}

/** Column defaults from the schema, for the tables these tests write to. */
const DEFAULTS: Record<string, Record<string, unknown>> = {
  unmatchedResult: { status: 'PENDING', autoLinkBlocked: false, markerCount: 0 },
  report: { voidedAt: null, status: 'PARSED' },
  reportResult: { caveatCodes: [], labStatusDisagrees: false, amendedAt: null },
  ingestionLogEntry: { markerCount: 0 },
  auditLogEntry: { actorType: 'USER' },
  randoxOrder: { pollAttempts: 0, consecutiveFailures: 0, status: 'INCOMPLETE' },
  // The sighting counter and its two timestamps are @default in the schema and
  // are read back by the queue and the confidence figure, so an undefined one
  // here would be the fake under test rather than the code.
  randoxAnalyteObservation: { sightings: 1, firstSeenAt: new Date(), lastSeenAt: new Date(), via: null, markerId: null },
};

class Table {
  rows: FakeRow[] = [];

  constructor(readonly name: string) {}

  async findUnique({ where }: { where: Record<string, unknown> }) {
    // Compound unique keys arrive as `{ reportId_markerId: {…} }`.
    const flattened: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(where)) {
      if (v !== null && typeof v === 'object' && k.includes('_')) Object.assign(flattened, v);
      else flattened[k] = v;
    }
    return this.rows.find((r) => matches(r, flattened)) ?? null;
  }

  async findFirst(args: { where?: Record<string, unknown> } = {}) {
    return this.rows.find((r) => matches(r, args.where)) ?? null;
  }

  async findMany(args: { where?: Record<string, unknown> } = {}) {
    return this.rows.filter((r) => matches(r, args.where));
  }

  async create({ data }: { data: Record<string, unknown> }) {
    // Schema defaults the fake has to honour, because the code under test
    // relies on them: an UnmatchedResult created without a status IS pending,
    // and a test that read `undefined` there would be testing the fake.
    const row: FakeRow = {
      // Every model here carries @default(now()) timestamps, and the polling
      // job does arithmetic on createdAt — an undefined one is a crash, not a
      // missing assertion.
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(DEFAULTS[this.name] ?? {}),
      id: (data.id as string) ?? nextId(this.name),
      ...data,
    };
    this.rows.push(row);
    return row;
  }

  async update({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
    const row = await this.findUnique({ where });
    if (!row) throw new Error(`${this.name}.update: no row matching ${JSON.stringify(where)}`);
    Object.assign(row, unwrapAtomics(row, data));
    return row;
  }

  async updateMany({ where, data }: { where?: Record<string, unknown>; data: Record<string, unknown> }) {
    const rows = this.rows.filter((r) => matches(r, where));
    for (const row of rows) Object.assign(row, unwrapAtomics(row, data));
    return { count: rows.length };
  }

  async upsert({
    where,
    create,
    update,
  }: {
    where: Record<string, unknown>;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }) {
    const existing = await this.findUnique({ where });
    if (existing) {
      Object.assign(existing, unwrapAtomics(existing, update));
      return existing;
    }
    return this.create({ data: create });
  }

  async deleteMany({ where }: { where?: Record<string, unknown> } = {}) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matches(r, where));
    return { count: before - this.rows.length };
  }

  async count({ where }: { where?: Record<string, unknown> } = {}) {
    return this.rows.filter((r) => matches(r, where)).length;
  }
}

/** `{ increment: 1 }` and friends, which Prisma accepts in a data payload. */
function unwrapAtomics(row: FakeRow, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === 'object' && 'increment' in (value as object)) {
      out[key] = ((row[key] as number) ?? 0) + ((value as { increment: number }).increment ?? 0);
    } else {
      out[key] = value;
    }
  }
  return out;
}

const TABLES = [
  'user',
  'patientProfile',
  'marker',
  'markerCategory',
  'panel',
  'source',
  'report',
  'reportResult',
  'reportResultExclusion',
  'reportMeasurements',
  // TWO TABLES, AND THE DOUBLE HAS TO KEEP THEM APART TOO. `referenceRange` is
  // the catalogue of fallbacks; `resultReferenceRange` is what one laboratory
  // printed on one report. A double that merged them would let a test pass
  // against exactly the shape the split exists to prevent.
  'referenceRange',
  'resultReferenceRange',
  'storedFile',
  'ingestionLogEntry',
  'auditLogEntry',
  'unmatchedResult',
  'randoxOrder',
  'randoxCatalogueEntry',
  'randoxUnknownCode',
  // What we have seen Randox actually send, per analyte string. The ingestion
  // path writes one row per distinct spelling per delivery and reads back the
  // mappings an admin accepted, so the double needs it or every ingestion test
  // dies on `undefined.findMany`.
  'randoxAnalyteObservation',
] as const;

export type FakePrisma = Record<(typeof TABLES)[number], Table> & {
  $transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
};

export function createFakePrisma(): FakePrisma {
  const db = {} as FakePrisma;
  for (const name of TABLES) {
    (db as Record<string, Table>)[name] = new Table(name);
  }
  // No isolation and no rollback. That is honest about what this is: the
  // tests below assert on committed outcomes, and a fake that pretended to
  // roll back would be claiming a guarantee it cannot make.
  db.$transaction = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(db);
  return db;
}

// ---------------------------------------------------------------------------
// Fixtures the ingestion path needs present before it will do anything
// ---------------------------------------------------------------------------

export function seedCatalogue(db: FakePrisma): void {
  db.source.rows.push({ id: 'src-randox', key: 'randox_api', name: 'Randox Nexus' });
  // NAME AND KEY BOTH TAKEN FROM THE REAL CATALOGUE, exactly as
  // resolveCatalogueMarkers() emits them. That matters now that the Randox
  // path resolves an analyte to a KEY (modules/randox/analyteMap.ts) and
  // materialiseReport looks that key up: a test catalogue holding
  // "platelet-count" where the real one holds "platelets" made a clean
  // delivery fail to file, and the failure looked like a bug in the mapper
  // rather than a stale fixture.
  const markers: [string, string, string][] = [
    ['Haemoglobin', 'haemoglobin', 'g/L'],
    ['Ferritin', 'ferritin', 'ug/L'],
    ['Total Cholesterol', 'total-cholesterol', 'mmol/L'],
    ['HDL Cholesterol', 'hdl', 'mmol/L'],
    ['Vitamin D', 'vitamin-d', 'nmol/L'],
    ['Alanine Aminotransferase (ALT)', 'alt', 'U/L'],
    // The three the mock's "normal, complete order" fixture reports. Present
    // so a lifecycle test can assert a genuinely clean parse rather than
    // asserting on a report held for an admin because the test catalogue was
    // short of a marker.
    ['Platelet Count', 'platelets', '10⁹/L'],
    ['Creatinine', 'creatinine', 'µmol/L'],
    ['Potassium', 'potassium', 'mmol/L'],
    ['Alkaline Phosphatase (ALP)', 'alp', 'U/L'],
  ];
  for (const [name, key, unit] of markers) {
    db.marker.rows.push({
      id: `marker-${key}`,
      key,
      name,
      aliases: [],
      defaultUnit: unit,
      resultType: 'MEASURED',
      isActive: true,
      severityMultiplier: 1.5,
      severityAbsoluteDelta: null,
    });
  }
}

export interface SeedPatientInput {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
  email?: string;
  sex?: 'MALE' | 'FEMALE' | 'ANY';
  withProfile?: boolean;
  deactivated?: boolean;
}

export function seedPatient(db: FakePrisma, input: SeedPatientInput) {
  const user: FakeRow = {
    id: input.id,
    email: input.email ?? `${input.id}@example.test`,
    role: 'PATIENT',
    status: 'ACTIVE',
    deactivatedAt: input.deactivated ? new Date() : null,
    createdAt: new Date(),
  };
  db.user.rows.push(user);

  if (input.withProfile === false) {
    // The `include` shape callers ask for, resolved eagerly — the fake does
    // not implement relations, so "no profile" has to be an explicit null
    // rather than an absent key, or a `!profile` guard would never fire.
    user.patientProfile = null;
    return user;
  }

  const profile: FakeRow = {
    id: `profile-${input.id}`,
    userId: input.id,
    firstName: input.firstName,
    lastName: input.lastName,
    dobEncrypted: encryptField(input.dob),
    contactNumberEncrypted: encryptField('07700900000'),
    sex: input.sex ?? 'ANY',
  };
  db.patientProfile.rows.push(profile);
  user.patientProfile = profile;
  return user;
}

export interface SeedOrderInput {
  orderNumber: string;
  patientId: string;
  /** The identity the order was PLACED under. Omit to simulate an old row. */
  ordered?: { firstName: string; lastName: string; dob: string } | null;
  randoxOrderId?: number;
  clinicId?: number;
}

export function seedOrder(db: FakePrisma, input: SeedOrderInput) {
  const patient = db.user.rows.find((u) => u.id === input.patientId);
  const profile = db.patientProfile.rows.find((p) => p.userId === input.patientId);
  const row: FakeRow = {
    id: `order-${input.orderNumber}`,
    orderNumber: input.orderNumber,
    randoxOrderId: input.randoxOrderId ?? 5001,
    clinicId: input.clinicId ?? 146,
    patientId: input.patientId,
    randoxPanelIds: [],
    randoxTestIds: [],
    orderedFirstName: input.ordered === null ? null : (input.ordered?.firstName ?? null),
    orderedLastName: input.ordered === null ? null : (input.ordered?.lastName ?? null),
    orderedDobEncrypted: input.ordered ? encryptField(input.ordered.dob) : null,
    status: 'PENDING_RESULTS',
    createdAt: new Date(),
    // The include shape ingestion asks for, resolved eagerly. The fake does
    // not implement `include`, so the relation is materialised here — which
    // is why seedPatient must be called first.
    patient: { ...patient, patientProfile: profile ?? null },
  };
  db.randoxOrder.rows.push(row);
  return row;
}
