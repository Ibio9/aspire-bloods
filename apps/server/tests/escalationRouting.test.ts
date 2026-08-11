import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRoutableEscalationAddress } from '../src/lib/productionBootChecks.js';
import { getClinicContact } from '../src/modules/content/clinicContact.js';
import { env } from '../src/config/env.js';

/**
 * THE ESCALATION ADDRESS AND THE ADDRESS PATIENTS ARE GIVEN ARE TWO THINGS.
 *
 * They were one variable. `getClinicContact()` read `ESCALATION_EMAIL`, so the
 * address a clinician is paged at was also the address printed in the portal
 * sidebar on every screen, beside every out-of-range result, and in the footer
 * of every Aspire summary PDF. Setting the escalation to a named individual —
 * which is what a small practice actually wants — published that person's
 * personal address to every patient, and into every PDF already downloaded.
 *
 * The separation is not something a reader can see, which is exactly why it
 * needs a test: the two variables can be given the same value and everything
 * still looks right.
 */

describe('the two addresses are separate', () => {
  it('gives patients CLINIC_CONTACT_EMAIL and not the escalation address', () => {
    expect(getClinicContact().email).toBe(env.CLINIC_CONTACT_EMAIL);
  });

  it('reads ESCALATION_EMAIL nowhere a patient can reach', () => {
    // The only two places allowed to touch it: the escalation itself, and the
    // boot check that refuses a deploy without it. Anything else reading it is
    // a route back to one variable doing two jobs.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = path.resolve(here, '../src');
    const readers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && fs.readFileSync(full, 'utf8').includes('env.ESCALATION_EMAIL')) {
          readers.push(path.relative(src, full).replace(/\\/g, '/'));
        }
      }
    };
    walk(src);
    expect(readers.sort()).toEqual(['lib/productionBootChecks.ts', 'modules/escalation/service.ts']);
  });
});

describe('production refuses to boot without a routable escalation address', () => {
  it('accepts the configured address', () => {
    expect(isRoutableEscalationAddress('raheelmalik@me.com')).toBe(true);
    expect(isRoutableEscalationAddress('clinical-team@aspireshield.com')).toBe(true);
    expect(isRoutableEscalationAddress(env.ESCALATION_EMAIL)).toBe(true);
  });

  it('refuses an empty or malformed one', () => {
    // Each of these reaches Resend and fails there, in a log, hours later —
    // and the practice's evidence that nothing needed attention is that
    // nothing arrived.
    for (const bad of ['', '   ', 'not-an-email', 'a@b', 'two addresses@one.com @two.com']) {
      expect(isRoutableEscalationAddress(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('stops at "is it an address" and does not pretend to know more', () => {
    // No code can tell whether a mailbox is read. A check that implied it
    // could would be worse than this one, so an address nobody monitors
    // passes here and is a question for the DPIA instead.
    expect(isRoutableEscalationAddress('nobody-reads-this@example.com')).toBe(true);
  });
});
