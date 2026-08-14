/**
 * The practice's contact details, for the moments where the product has to
 * hand a patient over to a human — a code that won't arrive, a locked
 * account, the service being down.
 *
 * The phone number is configuration, not a constant, and deliberately has no
 * hard-coded fallback: inventing a phone number for a real medical practice
 * risks sending patients to a stranger, which is far worse than showing them
 * the email address and postal address we can actually verify. Set
 * VITE_CLINIC_PHONE at build time and every "call us" affordance in the app
 * lights up automatically.
 */
export const CLINIC_PHONE: string | null = import.meta.env.VITE_CLINIC_PHONE?.trim() || null;

export const CLINIC_EMAIL = 'clinical-team@aspireshield.com';

/**
 * CORRECTED Aug 2026: it was "27 Mortimer Street, London", with no postcode.
 * The practice is at 29-35 and the postcode is W1T 3JG. A postcode is not
 * decoration on a clinic address — it is what a patient types into a map and
 * what a courier delivers a sample against — so it goes wherever the address
 * renders. Hyphen rather than an en dash: a street number range is a compound,
 * and the en dash in this product belongs to a numeric RANGE (3.9–5.1).
 */
export const CLINIC_ADDRESS = '29-35 Mortimer Street, London, W1T 3JG';

/** `tel:` needs the number stripped of spacing to dial reliably on mobile. */
export const CLINIC_PHONE_HREF = CLINIC_PHONE ? `tel:${CLINIC_PHONE.replace(/[^\d+]/g, '')}` : null;

/**
 * One phrase for "get in touch with a person", used wherever a flow dead-ends.
 * Prefers the phone number when one is configured, because the situations
 * that reach this copy are the ones where waiting on email is the wrong
 * answer.
 */
export function clinicContactSentence(): string {
  if (CLINIC_PHONE) return `call the clinic on ${CLINIC_PHONE}`;
  return `email the clinic at ${CLINIC_EMAIL}`;
}
