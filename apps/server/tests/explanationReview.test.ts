import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isRetractableApproval,
  mayBeRecordedAsReviewer,
  retractionReason,
  type ReviewStatus,
} from '../src/lib/explanationReview.js';

/**
 * SEEDING PRODUCES ZERO APPROVED EXPLANATIONS, AND THE PRODUCT SAYS ZERO.
 *
 * It said 72. Sixty-nine of those were attributed to Chloe Clinician, an
 * account the seed creates; one to Ada Admin, a Practice Administrator; two to
 * nobody at all. Every one of them read, in the review queue, exactly like a
 * clinician had signed it off, and a row the product reports as checked is
 * worse than a DRAFT one because nobody goes back to it.
 *
 * Two things are asserted here and they are different claims:
 *
 *  1. The DECISION — what counts as a review, and therefore what the seed
 *     takes back. A pure function, so this is exact rather than a smoke test.
 *  2. The SEED ITSELF never writes a review status. Read off the source,
 *     because the alternative is a database and this has to fail in
 *     `npm test`. It is a narrow, literal check for the two column names, and
 *     it is allowed to be crude: any new write of either column in the seed
 *     is a thing somebody should have to come here and justify.
 */

const FIXTURES = ['fixture-user-1', 'fixture-user-2'];
const fixtureIds = new Set(FIXTURES);
const row = (reviewStatus: ReviewStatus, reviewedById: string | null) => ({ reviewStatus, reviewedById });

describe('what counts as a review', () => {
  it('leaves a DRAFT row alone, whoever it points at', () => {
    expect(isRetractableApproval(row('DRAFT', null), fixtureIds)).toBe(false);
    expect(isRetractableApproval(row('DRAFT', 'fixture-user-1'), fixtureIds)).toBe(false);
    expect(isRetractableApproval(row('DRAFT', 'a-real-person'), fixtureIds)).toBe(false);
  });

  it('retracts a status with no reviewer, because there is nobody to ask', () => {
    for (const status of ['REVIEWED', 'PUBLISHED'] as const) {
      expect(isRetractableApproval(row(status, null), fixtureIds)).toBe(true);
      expect(retractionReason(row(status, null), null)).toContain('no reviewer recorded');
    }
  });

  it('retracts a status attributed to an account the seed creates', () => {
    expect(isRetractableApproval(row('PUBLISHED', 'fixture-user-1'), fixtureIds)).toBe(true);
    expect(retractionReason(row('PUBLISHED', 'fixture-user-1'), 'clinician@aspireshield.dev')).toContain(
      'an account created by the seed',
    );
  });

  it('leaves a real person’s decision alone, including a non-clinical one', () => {
    // Ada Admin approving clinical wording is a process step rather than a
    // clinical sign-off, and the audit says so. It is still a real person's
    // real act, and retracting it because we disagree with their job title
    // would be a worse defect than the one being fixed.
    expect(isRetractableApproval(row('PUBLISHED', 'ada-admin-real-account'), fixtureIds)).toBe(false);
  });
});

describe('who may be recorded as a reviewer', () => {
  const fixtureEmails = ['clinician@aspireshield.dev', 'demo.admin@aspireshield.dev'];

  it('refuses an account that does not exist rather than creating one', () => {
    const r = mayBeRecordedAsReviewer(null, fixtureEmails);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.why).toContain('refuses rather than creating one');
  });

  it('refuses a seeded fixture, case-insensitively', () => {
    for (const email of ['clinician@aspireshield.dev', 'Clinician@AspireShield.dev']) {
      const r = mayBeRecordedAsReviewer({ id: 'x', email }, fixtureEmails);
      expect(r.ok, email).toBe(false);
    }
  });

  it('accepts a real account', () => {
    expect(mayBeRecordedAsReviewer({ id: 'x', email: 'richard@example.org' }, fixtureEmails)).toEqual({ ok: true });
  });
});

describe('the seed itself', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const read = (p: string) => fs.readFileSync(path.resolve(here, p), 'utf8');

  /**
   * Comment lines stripped, because every one of these files talks at length
   * ABOUT reviewStatus and would otherwise match itself.
   */
  const code = (src: string) =>
    src
      .split('\n')
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
      })
      .join('\n');

  it('never writes a non-DRAFT review status', () => {
    for (const file of ['../prisma/seed.ts', '../prisma/markerExplanations.ts', '../prisma/seedCatalogue.ts']) {
      const src = code(read(file));
      // The seed may write DRAFT, and it may write the retraction back TO
      // DRAFT. It may not write anything else into that column.
      const writes = [...src.matchAll(/reviewStatus:\s*'([A-Z]+)'/g)].map((m) => m[1]);
      expect([...new Set(writes)].filter((w) => w !== 'DRAFT'), `${file} writes a non-DRAFT review status`).toEqual([]);
    }
  });

  it('never attributes a review to anybody', () => {
    // reviewedById is only ever written as null, by the retraction. A seed
    // that names a reviewer is a seed inventing one.
    const src = code(read('../prisma/seed.ts'));
    const writes = [...src.matchAll(/reviewedById:\s*([^,\n}]+)/g)].map((m) => m[1].trim());
    expect([...new Set(writes)].filter((w) => w !== 'null')).toEqual([]);
  });

  it('runs the retraction, so an old database is cleaned rather than only a new one', () => {
    // "Stopped creating them" is not "they are gone" — the rows an earlier
    // seed wrote are still in every database it ever ran against.
    const src = read('../prisma/seed.ts');
    expect(src).toContain('await retractSeedApprovals()');
  });
});
