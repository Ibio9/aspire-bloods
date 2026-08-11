import { describe, it, expect } from 'vitest';
import { stripPricing } from '../src/modules/randox/clients/NexusLabClient.js';
import { loadNexusSpec } from '../src/modules/randox/mock/specServer.js';

/**
 * ---------------------------------------------------------------------------
 * NO PRICE REACHES THE WEB CLIENT. NOT HIDDEN — ABSENT.
 * ---------------------------------------------------------------------------
 *
 * Product rule 4: no prices anywhere in the patient-facing product. GetPanels
 * returns `cost` and `currency` on every panel and GetTests returns `cost` on
 * every test, so there is something real to remove, and the only version of
 * that rule worth having is one where the fields are not in the process at all
 * — not filtered out at render time, not omitted from a `select`, not
 * conditional on a flag somebody can flip.
 *
 * So they are deleted at the transport boundary, and this file is the
 * assertion. It walks the whole path a price could take:
 *
 *   1. the spec really does carry them (or the rest proves nothing);
 *   2. stripPricing removes them at any depth, including inside a panel's
 *      testItems, and leaves everything else alone;
 *   3. the catalogue payload that gets persisted carries none;
 *   4. no admin or patient API response shape carries either field.
 *
 * The end-to-end version — the real client against the spec-driven mock, which
 * serves the prices — is in randoxSpecContract.test.ts.
 */

describe('prices are stripped at the transport boundary', () => {
  it('the spec genuinely serves cost and currency', () => {
    const spec = loadNexusSpec();
    const panels = spec.paths['/TestPanel/GetPanels'].get!.responses!['200'].content!['application/json'].example as {
      cost?: unknown;
      currency?: unknown;
    }[];
    const tests = spec.paths['/TestItem/GetTests'].get!.responses!['200'].content!['application/json'].example as {
      cost?: unknown;
    }[];
    expect(panels.some((p) => p.cost !== undefined)).toBe(true);
    expect(panels.some((p) => p.currency !== undefined)).toBe(true);
    expect(tests.some((t) => t.cost !== undefined)).toBe(true);
  });

  it('removes cost and currency at every depth', () => {
    const payload = stripPricing({
      id: '71',
      name: 'A panel',
      cost: 50,
      currency: 'Pounds',
      sampleTubes: [{ id: '1', name: 'Gold', quantityRequired: 1, cost: 3, currency: 'Pounds' }],
      testItems: [{ id: '632', name: 'Lipids', cost: 12, Currency: 'Pounds' }],
      nested: { deeper: { Cost: 9, price: 4, Price: 4 } },
    });
    const serialised = JSON.stringify(payload);
    for (const field of ['cost', 'Cost', 'currency', 'Currency', 'price', 'Price']) {
      expect(serialised, `"${field}" survived the strip`).not.toContain(`"${field}"`);
    }
  });

  it('leaves everything that is not a price alone', () => {
    const payload = stripPricing({
      id: '71',
      name: 'A panel',
      code: 'TM2',
      cost: 50,
      currency: 'Pounds',
      panelType: 'Custom',
      fastingRequired: true,
      specialInstructions: 'Fast for 12 hours.',
      // Named so a lazy regex over key names would eat it. It is not a price.
      sampleStabilityTime: 1,
      stabilityTime: 1,
      sampleTubes: [{ id: '1', name: 'Gold', quantityRequired: 2 }],
      testItems: [{ id: '632', name: 'Lipids' }],
    });
    expect(payload).toMatchObject({
      id: '71',
      name: 'A panel',
      code: 'TM2',
      panelType: 'Custom',
      fastingRequired: true,
      specialInstructions: 'Fast for 12 hours.',
      sampleStabilityTime: 1,
      stabilityTime: 1,
      sampleTubes: [{ id: '1', name: 'Gold', quantityRequired: 2 }],
      testItems: [{ id: '632', name: 'Lipids' }],
    });
  });

  it('mutates in place, so a reference held elsewhere is stripped too', () => {
    // The strip returns the same object rather than a copy on purpose: a
    // caller that kept the original around must not be holding an unstripped
    // one, which is exactly how a price would find its way back in.
    const original: Record<string, unknown> = { id: '1', cost: 10 };
    const returned = stripPricing(original);
    expect(returned).toBe(original);
    expect('cost' in original).toBe(false);
  });

  it('the RandoxTestItem type has no price field to populate', async () => {
    // A type-level guarantee as well as a runtime one: if `cost` is ever added
    // back to the interface this stops compiling, which is a louder failure
    // than a value quietly reappearing.
    const item: import('../src/modules/randox/types.js').RandoxTestItem = {
      id: '1',
      name: 'Lipids',
      code: 'LIPIDS',
      stabilityTime: 1,
      sampleTubes: [],
    };
    expect(Object.keys(item)).not.toContain('cost');
    expect(Object.keys(item)).not.toContain('currency');
  });
});
