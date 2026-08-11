import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { resolveCatalogueMarkers } from '@aspire-bloods/shared';
import {
  MEASURED_EXPLANATIONS,
  GENETIC_EXPLANATIONS,
  COMPOSITION_EXPLANATIONS,
  QUALITATIVE_EXPLANATIONS,
  explanationFor,
  foodNameFromMarkerName,
} from '../prisma/markerExplanations.js';

/**
 * Two things are being defended here, and they fail in opposite directions.
 *
 * COVERAGE: every marker the catalogue can produce has copy. The failure this
 * prevents is a patient opening a marker they paid for and finding nothing
 * there, which is what the old "being finalised" placeholder was.
 *
 * RESTRAINT: the copy describes the analyte and never the reader. The failure
 * this prevents is worse than the first one, because it is content nobody
 * clinical has signed off making a statement about somebody's health. So the
 * assertions below are deliberately blunt: banned vocabulary, no second person
 * about results, no diagnosis, no instruction.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

/** The copy for markers seed.ts carries itself, parsed out of its own source. */
function seedAuthoredKeys(): Set<string> {
  const src = readFileSync(join(REPO_ROOT, 'apps/server/prisma/seed.ts'), 'utf8');
  return new Set([...src.matchAll(/\{\s*key:\s*'([^']+)'[^\n]*whatItIs:/g)].map((m) => m[1]));
}

function allCopy(): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  for (const [key, v] of Object.entries(MEASURED_EXPLANATIONS)) out.push({ key, text: v.whatItIs });
  for (const [key, v] of Object.entries(GENETIC_EXPLANATIONS)) out.push({ key, text: v.whatItIs });
  for (const [key, v] of Object.entries(COMPOSITION_EXPLANATIONS)) out.push({ key, text: v.whatItIs });
  for (const [key, v] of Object.entries(QUALITATIVE_EXPLANATIONS)) out.push({ key, text: v.whatItIs });
  // One representative of the food panel: every one of the 207 is the same
  // sentence with a different noun in it, so testing one tests all of them.
  out.push({ key: 'cod-igg', text: explanationFor({ key: 'cod-igg', name: 'Cod (IgG)', resultType: 'SENSITIVITY' })!.whatItIs });
  return out;
}

describe('marker explanation coverage', () => {
  const seeded = seedAuthoredKeys();
  const catalogue = resolveCatalogueMarkers();

  it('covers every catalogue marker, between seed.ts and markerExplanations.ts', () => {
    const uncovered = catalogue
      .filter((m) => !seeded.has(m.key))
      .filter((m) => explanationFor({ key: m.key, name: m.name, resultType: m.resultType }) === null)
      .map((m) => `${m.key} (${m.resultType})`);
    expect(uncovered).toEqual([]);
  });

  it('covers all five result types', () => {
    const byType = catalogue.reduce<Record<string, number>>((acc, m) => {
      const covered =
        seeded.has(m.key) || explanationFor({ key: m.key, name: m.name, resultType: m.resultType }) !== null;
      if (covered) acc[m.resultType] = (acc[m.resultType] ?? 0) + 1;
      return acc;
    }, {});
    expect(byType).toEqual({ MEASURED: 164, GENETIC: 32, SENSITIVITY: 207, COMPOSITION: 10, QUALITATIVE: 22 });
  });

  it('has no key that no catalogue marker uses', () => {
    const live = new Set(catalogue.map((m) => m.key));
    const dead = [
      ...Object.keys(MEASURED_EXPLANATIONS),
      ...Object.keys(GENETIC_EXPLANATIONS),
      ...Object.keys(COMPOSITION_EXPLANATIONS),
      ...Object.keys(QUALITATIVE_EXPLANATIONS),
    ].filter((k) => !live.has(k));
    expect(dead).toEqual([]);
  });
});

describe('the food sensitivity panel', () => {
  it('names the food and says plainly that a result is not a reason to avoid it', () => {
    const copy = explanationFor({ key: 'wheat-igg', name: 'Wheat (IgG)', resultType: 'SENSITIVITY' })!.whatItIs;
    expect(copy).toContain('Wheat');
    expect(copy).toContain('not a reason to avoid Wheat');
    // The panel's whole clinical problem is people reading it as a list of
    // foods to cut out. The named bodies are the reason it must not be.
    expect(copy).toContain('BSACI');
    expect(copy).toContain('EAACI');
    expect(copy).toContain('AAAAI');
  });

  it('reads exposure, never intolerance', () => {
    const copy = explanationFor({ key: 'egg-white-igg', name: 'Egg White (IgG)', resultType: 'SENSITIVITY' })!.whatItIs;
    expect(copy).toMatch(/records exposure/i);
    expect(copy).not.toMatch(/\bintolerant\b|\bintolerance\b|\ballergic\b/i);
  });

  it('strips only the catalogue suffix from a food name', () => {
    expect(foodNameFromMarkerName('Milk (Cow) (IgG)')).toBe('Milk (Cow)');
    expect(foodNameFromMarkerName('Tea (Green) (IgG)')).toBe('Tea (Green)');
  });
});

describe('house style and clinical restraint', () => {
  const copy = allCopy();

  it('has no em dashes', () => {
    expect(copy.filter((c) => c.text.includes('—')).map((c) => c.key)).toEqual([]);
  });

  it('uses no evaluative or diagnostic vocabulary', () => {
    // "optimal" is banned because an optimal range is a specific product
    // concept with its own sourcing rule; explanation copy never asserts one.
    const banned = /\b(good|bad|healthy|unhealthy|concerning|worrying|danger|dangerous|abnormal|optimal|deficient)\b/i;
    const hits = copy.filter((c) => banned.test(c.text)).map((c) => `${c.key}: ${c.text.match(banned)![0]}`);
    expect(hits).toEqual([]);
  });

  it('never claims a marker diagnoses anything', () => {
    // "diagnosis" as a word is allowed and sometimes necessary: several tumour
    // markers exist to follow disease already diagnosed, and saying so is what
    // stops them reading as screening tests. What is banned is this copy
    // asserting that a marker makes one.
    const claimsDiagnosis = /\b(diagnoses|is diagnostic|diagnostic (of|for)|used to diagnose|confirms? (a )?diagnosis)\b/i;
    const hits = copy.filter((c) => claimsDiagnosis.test(c.text)).map((c) => `${c.key}: ${c.text.match(claimsDiagnosis)![0]}`);
    expect(hits).toEqual([]);
  });

  it('never tells the reader what a result of theirs means', () => {
    // The line this file exists to hold. Anything of the shape "a high level
    // means", "if yours is low", "suggests that you" is a statement about the
    // person rather than the analyte, and none of this copy is clinician-read.
    const aboutTheReader =
      /\b(your (result|level|value|score)|a (high|low|raised|reduced) (level|result|value)|if (it|yours) is (high|low)|means that you|suggests you|indicates you|you (may|might|could) have)\b/i;
    const hits = copy.filter((c) => aboutTheReader.test(c.text)).map((c) => `${c.key}: ${c.text.match(aboutTheReader)![0]}`);
    expect(hits).toEqual([]);
  });

  it('never instructs the reader to do anything', () => {
    const instruction = /\b(you should|you must|you need to|we recommend|it is recommended|try to|make sure you|consider (taking|eating|avoiding))\b/i;
    const hits = copy.filter((c) => instruction.test(c.text)).map((c) => `${c.key}: ${c.text.match(instruction)![0]}`);
    expect(hits).toEqual([]);
  });

  it('uses British spellings', () => {
    const american = /\b(analyze|behavior|color|fiber|hemoglobin|liter|meter|estrogen|anemia|edema|tumor|pediatric)\b/i;
    const hits = copy.filter((c) => american.test(c.text)).map((c) => `${c.key}: ${c.text.match(american)![0]}`);
    expect(hits).toEqual([]);
  });

  it('is one to three sentences and long enough to say something', () => {
    for (const c of copy) {
      const sentences = c.text.split(/\.\s+(?=[A-Z“"])/).length;
      expect(sentences, `${c.key} has ${sentences} sentences`).toBeLessThanOrEqual(3);
      expect(c.text.length, `${c.key} is too short to be a real explanation`).toBeGreaterThan(80);
    }
  });

  it('writes only whatItIs, leaving the "if it is high" fields empty', () => {
    // Those three fields are statements about the reader by construction. None
    // of this copy has been reviewed by a clinician, so none of it fills them.
    for (const v of [
      ...Object.values(MEASURED_EXPLANATIONS),
      ...Object.values(GENETIC_EXPLANATIONS),
      ...Object.values(COMPOSITION_EXPLANATIONS),
      ...Object.values(QUALITATIVE_EXPLANATIONS),
    ]) {
      expect(Object.keys(v)).toEqual(['whatItIs']);
    }
  });
});

describe('genetic copy', () => {
  it('never says the reader has or will develop a condition', () => {
    const implies = /\b(you have|you will (develop|get)|puts you at|means you are at|predicts)\b/i;
    const hits = Object.entries(GENETIC_EXPLANATIONS)
      .filter(([, v]) => implies.test(v.whatItIs))
      .map(([k]) => k);
    expect(hits).toEqual([]);
  });

  it('frames every entry as inherited rather than measured', () => {
    for (const [key, v] of Object.entries(GENETIC_EXPLANATIONS)) {
      expect(v.whatItIs, `${key} should say it relates to or looks at inherited variation`).toMatch(
        /\b(relates to|looks at)\b/i,
      );
    }
  });
});

describe('microbiome copy', () => {
  it('says every reading is a share of the whole rather than an amount', () => {
    for (const [key, v] of Object.entries(COMPOSITION_EXPLANATIONS)) {
      expect(v.whatItIs, `${key} should frame itself as a proportion`).toMatch(
        /\b(shares?|proportions?|ratio|make-up)\b/i,
      );
    }
  });

  it('never leaves a reading sounding more interpretable than it is', () => {
    // Every entry either states the uncertainty outright or names what it is
    // not, because a bare description of a microbiome proportion reads as
    // though somebody knows what the number should be, and nobody does.
    for (const [key, v] of Object.entries(COMPOSITION_EXPLANATIONS)) {
      expect(v.whatItIs, `${key} states neither its uncertainty nor its limits`).toMatch(
        /\b(no agreed|no established|no reference range|unsettled|open question|inconsistent|least well understood|has not supported|is not (the same|a test|a measurement)|rather than as a measurement)\b/i,
      );
    }
  });
});

describe('qualitative copy', () => {
  it('says in its own words that the result is not a number', () => {
    // The same property the microbiome block asserts, for the same reason: a
    // bare description of an organism or a device reading sits in a results
    // portal looking exactly like an assay, and this copy has to say it is not
    // one. Every entry either reports a detection, describes a property of the
    // sample, or names itself as an interpretation or a calculation.
    for (const [key, v] of Object.entries(QUALITATIVE_EXPLANATIONS)) {
      expect(v.whatItIs, `${key} never says it is a finding rather than an amount`).toMatch(
        /\b(whether (it|they) (was|were) detected|property of bacteria|written interpretation|a reading taken|calculated score)\b/i,
      );
    }
  });
});

describe('the placeholder', () => {
  /** Every source file that ships, excluding build output and dependencies. */
  function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (['node_modules', 'dist', '.git', 'build', 'coverage', 'test-results', 'playwright-report'].includes(entry)) {
        continue;
      }
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) sourceFiles(full, acc);
      else if (/\.(ts|tsx|js|jsx|json|md|sql)$/.test(entry)) acc.push(full);
    }
    return acc;
  }

  it('exists nowhere in the repository, including this test', () => {
    // Assembled rather than written out, so the string this test forbids is
    // not itself a hit. Anything reintroducing the placeholder fails here.
    const placeholder = ['An explanation for this marker is', 'being finalised'].join(' ');
    const offenders = sourceFiles(REPO_ROOT).filter((f) => readFileSync(f, 'utf8').includes(placeholder));
    expect(offenders.map((f) => f.slice(REPO_ROOT.length + 1))).toEqual([]);
  });
});
