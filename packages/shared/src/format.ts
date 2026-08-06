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
    return { y: value.getUTCFullYear(), m: value.getUTCMonth(), d: value.getUTCDate() };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return { y: parsed.getUTCFullYear(), m: parsed.getUTCMonth(), d: parsed.getUTCDate() };
  }
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

/** "5 August 2026" — the house format for every user-facing date. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const p = parts(value);
  if (!p) return '—';
  return `${p.d} ${MONTHS[p.m]} ${p.y}`;
}

/** "5 Aug 2026" — chart axes and other genuinely space-constrained places only. */
export function formatDateShort(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const p = parts(value);
  if (!p) return '—';
  return `${p.d} ${MONTHS_SHORT[p.m]} ${p.y}`;
}

/** "5 August 2026 at 14:32" — audit trails and amendment stamps, where the time matters. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
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
