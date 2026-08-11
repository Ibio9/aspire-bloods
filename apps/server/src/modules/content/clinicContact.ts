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
    addressLines: ['27 Mortimer Street', 'London'],
    email: env.ESCALATION_EMAIL,
    phone: env.CLINIC_PHONE || null,
    hours: env.CLINIC_HOURS,
    emergencyNote: 'In a medical emergency, call 999 or NHS 111.',
  };
}
