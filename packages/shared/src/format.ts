/**
 * User-facing formatting. ISO (2026-08-05) is a database/transport format —
 * it must never reach a screen, a PDF, a chart axis, or an export. Every
 * date a patient or clinician reads goes through here.
 *
 * Shared (not web-only) because the summary PDF and escalation emails are
 * rendered server-side and have to match the portal exactly — a patient
 * comparing their PDF against the screen should see the same date written
 * the same way.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * Parses the two shapes the API actually emits — a bare 'YYYY-MM-DD' date
 * and a full ISO timestamp — without letting the runtime's local timezone
 * shift the day. `new Date('2026-08-05')` is parsed as UTC midnight, which
 * in any negative-offset timezone renders as the 4th; sample dates are
 * calendar dates, not instants, so we read the parts directly instead.
 */
function parts(value: string | Date): { y: number; m: number; d: number } | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // A Date from Prisma for a date-only column is UTC midnight; reading it
    // locally west of Greenwich would render the day before.
    return { y: value.getUTCFullYear(), m: value.getUTCMonth(), d: value.getUTCDate() };
  }
  // A bare 'YYYY-MM-DD' is a calendar date — read the parts directly, so no
  // timezone can shift it.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (dateOnly) {
    return { y: Number(dateOnly[1]), m: Number(dateOnly[2]) - 1, d: Number(dateOnly[3]) };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  // A full timestamp is an INSTANT, and an instant renders in the reader's own
  // day. This used to take the UTC parts, which put it a day out for anything
  // stamped between midnight and 01:00 UK time in summer: an amendment made at
  // 00:30 BST on the 6th showed the patient "Amended 5 August" while the audit
  // log — which has always used formatDateTime, and local time — recorded it as
  // "6 August 2026 at 00:30". A clinical record disagreeing with its own audit
  // trail about the date is exactly the kind of discrepancy the amendment
  // stamp exists to prevent.
  return { y: parsed.getFullYear(), m: parsed.getMonth(), d: parsed.getDate() };
}

/**
 * What a date slot says when there is no date in it. Words rather than a dash,
 * for the same reason a marker with no result says so in words: a punctuation
 * mark standing in for a fact is something the reader has to decode, and half
 * of them decode it as a rendering fault.
 */
const NO_DATE = 'Not recorded';

/** "5 August 2026", the house format for every user-facing date. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return NO_DATE;
  const p = parts(value);
  if (!p) return NO_DATE;
  return `${p.d} ${MONTHS[p.m]} ${p.y}`;
}

/** "5 Aug 2026", for chart axes and other genuinely space-constrained places only. */
export function formatDateShort(value: string | Date | null | undefined): string {
  if (!value) return NO_DATE;
  const p = parts(value);
  if (!p) return NO_DATE;
  return `${p.d} ${MONTHS_SHORT[p.m]} ${p.y}`;
}

/** "5 August 2026 at 14:32", for audit trails and amendment stamps, where the time matters. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return NO_DATE;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return NO_DATE;
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()} at ${time}`;
}

/**
 * The title of a report, wherever one is shown. A panel is optional — a
 * one-off or ad-hoc set of markers has no panel behind it — so the fallback
 * has to be a complete, self-explanatory phrase ("12 markers · 4 August
 * 2026"), never a bare fragment or an empty heading.
 */
export function formatReportTitle(
  panelName: string | null | undefined,
  markerCount: number | null | undefined,
  sampleDate: string | Date | null | undefined,
): string {
  if (panelName && panelName.trim()) return panelName.trim();
  const date = formatDate(sampleDate);
  if (typeof markerCount === 'number' && markerCount > 0) {
    return `${markerCount} marker${markerCount === 1 ? '' : 's'} · ${date}`;
  }
  return `Results · ${date}`;
}

/**
 * The same title, for the places that already print the date right beside it.
 *
 * formatReportTitle has to be self-contained: it labels a PDF, an email
 * subject and a breadcrumb, where nothing else says when the sample was
 * taken. On a card whose eyebrow is already "6 AUGUST 2026", the full form
 * lands as "6 AUGUST 2026 / 12 markers · 6 August 2026", which reads like a
 * rendering fault rather than a title.
 *
 * So: the panel's name where there is one, and the count alone where there
 * isn't. Never empty, and never the date twice.
 */
export function formatReportHeading(
  panelName: string | null | undefined,
  markerCount: number | null | undefined,
): string {
  if (panelName && panelName.trim()) return panelName.trim();
  if (typeof markerCount === 'number' && markerCount > 0) {
    return `${markerCount} marker${markerCount === 1 ? '' : 's'}`;
  }
  return 'Results';
}

/**
 * "i••••@gmail.com" — enough for the patient to confirm we're sending to
 * the address they expect, not enough to disclose the address to anyone
 * reading over their shoulder or to an attacker probing the resend endpoint.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return 'your email address';
  const at = email.lastIndexOf('@');
  if (at <= 0) return 'your email address';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, 1);
  // A fixed run of dots, deliberately not one-per-hidden-character: varying
  // the length would make the mask a character count of the address, which
  // narrows guesses for anyone probing the resend endpoint. The first letter
  // plus the domain is already enough for the patient to recognise their own
  // address, which is the only job this has.
  return `${visible}${'•'.repeat(5)}${domain}`;
}
