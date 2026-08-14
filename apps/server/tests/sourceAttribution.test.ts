import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceLabel } from '../src/lib/sourceLabel.js';

/**
 * ============================================================================
 *  "ANALYSED BY RANDOX HEALTH" IS OFF EVERY PATIENT SURFACE, AND ON EXACTLY ONE
 *  DOCUMENT.
 * ============================================================================
 *
 * The line was removed from the patient's result cards, marker page, report
 * header, By-test view, report list, Overview and chart tooltip: beside somebody
 * else's own result the laboratory's name says something about the practice's
 * commercial arrangements and nothing about the number next to it.
 *
 * It went on being COMPUTED AND SENT on six patient-portal payloads for months
 * afterwards, which is the failure this file exists to stop. A field nothing
 * renders is not removed, it is dormant — one autocomplete away from being
 * printed again on the screens it was specifically taken off — and no screenshot
 * review can see it, because it is invisible until the day it is not.
 *
 * THE ONE EXCEPTION IS THE GP HANDOVER PDF, and it is an exception on a real
 * argument rather than an oversight: a reference interval is ASSAY-SPECIFIC, so
 * a doctor holding our range against their own laboratory's needs to know whose
 * analyser produced it. That document names the laboratory in its title grid.
 * The PATIENT's summary PDF does not.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../src');

function filesImporting(needle: string): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && fs.readFileSync(full, 'utf8').includes(needle)) {
        hits.push(path.relative(SRC, full).replace(/\\/g, '/'));
      }
    }
  };
  walk(SRC);
  return hits.sort();
}

describe('the source label reaches the console and the doctor, and nobody else', () => {
  it('is imported by exactly the read models that are allowed to print it', () => {
    // lib/sourceLabel.ts itself is the definition. The other two are ADMIN read
    // models: the console's report detail and its patient views, where the label
    // says which feed a row came from.
    //
    // patients/portalService.ts IS NOT ON THIS LIST and must not go back on it.
    // That file serves the Overview, All markers, Trends, Library and Documents
    // — every cross-report screen a patient looks at.
    expect(filesImporting("from '../../lib/sourceLabel.js'")).toEqual([
      'modules/patients/service.ts',
      'modules/reports/service.ts',
    ]);
  });

  it('does not appear anywhere in the patient portal read models', () => {
    const portal = fs.readFileSync(path.join(SRC, 'modules/patients/portalService.ts'), 'utf8');
    // Matches the field name in a DTO as well as the import. The file's own
    // header comment explains the absence, which is why the check is on code
    // shape rather than on the string.
    expect(portal.includes('sourceLabel(')).toBe(false);
    expect(/^\s*sourceLabel:/m.test(portal)).toBe(false);
  });

  it('is on the GP handover and not on the patient summary', () => {
    const handover = fs.readFileSync(path.join(SRC, 'modules/export/gpHandover.ts'), 'utf8');
    const summary = fs.readFileSync(path.join(SRC, 'modules/export/pdfSummary.ts'), 'utf8');
    // The handover names the laboratory in its identity grid. Asserted on the
    // ROW, because the argument for restoring it was that a GP needs a field
    // they can find rather than a clause inside a paragraph.
    expect(handover).toContain("['Laboratory', report.source.name, false]");
    expect(summary.toLowerCase()).not.toContain('laboratory’s name');
    expect(summary).not.toContain('report.source.name');
  });
});

describe('the label itself is unchanged', () => {
  it('still names Randox for every Randox feed', () => {
    // Not deleted — the console and the handover both read it.
    expect(sourceLabel('randox_api', 'Randox Health')).toBe('Analysed by Randox Health');
    expect(sourceLabel('randox_pdf', 'Randox Health')).toBe('Analysed by Randox Health');
    expect(sourceLabel('randox_portal', 'Randox Health')).toBe('Analysed by Randox Health');
  });

  it('still says nothing at all for an in-house result', () => {
    // Empty is a VALUE here, not a gap: where the clinic analysed it itself
    // there is no second party to name. Every render site guards it.
    expect(sourceLabel('aspire_inhouse', 'Aspire Clinic')).toBe('');
  });
});
