/**
 * ---------------------------------------------------------------------------
 * Comparing two claims about who somebody is.
 * ---------------------------------------------------------------------------
 *
 * One module, used by every path that decides whether a result may be filed
 * against an account:
 *
 *   - modules/admin/linkingService.ts   an admin linking by hand,
 *   - modules/randox/identityCheck.ts   the automatic link on an order we
 *                                       placed ourselves.
 *
 * They must not drift. A suggestion the admin UI ranks first that the server
 * would then refuse is worse than no suggestion; an automatic link made on a
 * looser rule than the manual one is worse still, because nobody is watching
 * when it happens.
 *
 * Nothing here is fuzzy. Names are compared after accents, punctuation and
 * spacing are removed, and that is the whole of the tolerance — no edit
 * distance, no nickname table, no phonetic key. "Smith" and "Smyth" are two
 * different people and this module says so.
 */

/**
 * Comparable form of a name: case, accents, punctuation and spacing removed.
 * NFD splits accented letters into base + combining mark, and the final
 * [^a-z] filter then drops the marks along with hyphens, apostrophes and
 * spaces — so "O'Brien", "o brien" and "Ó Brién" all compare equal, while
 * two genuinely different names still don't.
 */
export function normaliseName(value: string | null | undefined): string {
  if (!value) return '';
  return value.normalize('NFD').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Comparable form of a phone number. The same UK mobile is written
 * "07700 900123" by a patient and "+44 7700 900123" by a lab, so comparing
 * digit strings would call those two different numbers. Reducing to the last
 * nine digits makes trunk-zero and country-code differences disappear.
 *
 * Nine is enough to distinguish real numbers and short enough to survive any
 * prefix; anything shorter is compared whole. This is only ever a supporting
 * signal — a matching phone number never makes a link permissible on its own
 * (see assessMatch), so a false positive here can't reach a patient's record.
 */
const PHONE_SIGNIFICANT_DIGITS = 9;

export function normalisePhone(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  return digits.length > PHONE_SIGNIFICANT_DIGITS ? digits.slice(-PHONE_SIGNIFICANT_DIGITS) : digits;
}

/**
 * ISO date, day precision. Anything unparseable compares equal to nothing.
 *
 * Day precision, not millisecond: a date of birth reaches us as "1984-03-02"
 * from one source and "1984-03-02T00:00:00.000Z" from another, and those are
 * the same birthday. Trailing time is cut rather than parsed when the value
 * already starts with an ISO date, so a "1984-03-02T23:30:00+01:00" — which
 * `new Date()` would move to the 3rd in UTC — keeps the day the lab wrote.
 */
export function normaliseDob(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  // The date's own calendar day, NOT toISOString(). A non-ISO string like
  // "12 April 1988" is parsed as LOCAL midnight, and toISOString() then
  // converts that to UTC — which in any timezone east of Greenwich lands on
  // the 11th. A date of birth that silently moves by a day is a link
  // refused, or worse, a link made against the wrong record.
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface MatchAgreement {
  dob: boolean;
  firstName: boolean;
  lastName: boolean;
  contactNumber: boolean;
  /** True only when the rules below are satisfied. Never true on names alone. */
  linkable: boolean;
  /** Why not, in words an admin can act on. Null when linkable. */
  blockedReason: string | null;
}

export interface ClaimedIdentity {
  firstName: string | null;
  lastName: string | null;
  dob: string | null;
  contactNumber: string | null;
}

export interface AccountIdentity {
  firstName: string | null;
  lastName: string | null;
  dob: string | null;
  contactNumber: string | null;
}

/**
 * The whole safety rule, in one place, used both to rank candidates for the
 * admin and to accept or refuse the link itself.
 *
 * Date of birth must agree. If the lab supplied none, the link is refused
 * outright rather than falling back to the weaker signal — names collide,
 * families share them, and transcription mangles them.
 */
export function assessMatch(claimed: ClaimedIdentity, account: AccountIdentity): MatchAgreement {
  const claimedDob = normaliseDob(claimed.dob);
  const accountDob = normaliseDob(account.dob);

  const dob = claimedDob !== '' && claimedDob === accountDob;
  const firstName =
    normaliseName(claimed.firstName) !== '' && normaliseName(claimed.firstName) === normaliseName(account.firstName);
  const lastName =
    normaliseName(claimed.lastName) !== '' && normaliseName(claimed.lastName) === normaliseName(account.lastName);
  const contactNumber =
    normalisePhone(claimed.contactNumber) !== '' &&
    normalisePhone(claimed.contactNumber) === normalisePhone(account.contactNumber);

  let blockedReason: string | null = null;
  if (claimedDob === '') {
    blockedReason =
      'The laboratory supplied no date of birth with this result, so there is nothing to check the account against. Ask them to confirm it before linking.';
  } else if (!dob) {
    blockedReason = 'The date of birth on this result does not match the date of birth on this account.';
  } else if (!firstName && !lastName) {
    blockedReason = 'The name on this result does not match the name on this account.';
  }

  return { dob, firstName, lastName, contactNumber, linkable: blockedReason === null, blockedReason };
}

/** Ranking for the admin's candidate list. Never an authorisation decision. */
export function candidateRank(a: MatchAgreement): number {
  return (a.dob ? 8 : 0) + (a.lastName ? 4 : 0) + (a.firstName ? 2 : 0) + (a.contactNumber ? 1 : 0);
}
