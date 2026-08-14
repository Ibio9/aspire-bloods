import { env } from '../../config/env.js';

/**
 * The clinic's own contact details, served to the portal so "how do I reach
 * someone about this" is answerable from the sidebar of every screen rather
 * than from a page someone has to go looking for.
 *
 * Address and email are the ones already committed to in the out-of-range
 * copy block and the Aspire summary PDF footer. The phone number is env-only
 * with no default: there is no real switchboard number recorded anywhere in
 * this codebase, and inventing one that rings nowhere is worse than showing
 * no phone number at all (same reasoning as lib/authErrors.ts). Set
 * CLINIC_PHONE and the portal starts showing it everywhere at once.
 *
 * THE EMAIL IS `CLINIC_CONTACT_EMAIL`, NOT `ESCALATION_EMAIL` (Aug 2026).
 * It read the escalation address, so one variable answered two unrelated
 * questions: where a clinician is paged when a release comes back out of
 * range, and what address a patient is told to write to. Those want different
 * values — the first is a named person who is on duty, the second is a shared
 * inbox that outlives whoever that is — and pointing the escalation at an
 * individual silently printed their personal address in the portal sidebar of
 * every screen, beside every out-of-range result, and in every PDF.
 */
export interface ClinicContact {
  name: string;
  addressLines: string[];
  email: string;
  phone: string | null;
  hours: string;
  emergencyNote: string;
}

/**
 * "Aspire Group of Companies" is gone from every line a patient reads (Aug
 * 2026). The practice is Aspire Clinic to the people it treats; the registered
 * entity name survives where it is genuinely the legal company, which is
 * PRIVACY.md and SECURITY.md and nowhere else.
 *
 * `name` is deliberately not repeated inside `addressLines` either — every
 * surface that renders this prints the name above the address, and carrying it
 * in both produced "Aspire Clinic, Aspire Clinic, 27 Mortimer Street".
 */
export function getClinicContact(): ClinicContact {
  return {
    name: 'Aspire Clinic',
    // CORRECTED Aug 2026: it was 27 with no postcode. 29-35 Mortimer Street,
    // London, W1T 3JG. The postcode is its own line rather than appended to
    // "London", because every surface that renders this prints one item per
    // line and a postcode is the line a reader copies on its own.
    addressLines: ['29-35 Mortimer Street', 'London', 'W1T 3JG'],
    email: env.CLINIC_CONTACT_EMAIL,
    phone: env.CLINIC_PHONE || null,
    hours: env.CLINIC_HOURS,
    emergencyNote: 'In a medical emergency, call 999 or NHS 111.',
  };
}
