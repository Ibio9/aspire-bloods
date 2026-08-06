/**
 * Pure date helpers behind DateField — kept out of the component so the
 * parsing rules (the part a mistyped date of birth depends on) can be tested
 * without rendering anything.
 */

/**
 * What a given date field is *for*. A sample date and a date of birth want
 * opposite ends of the calendar, so the field is configured rather than
 * one-size-fits-all: the preset decides the allowed range and where the
 * calendar opens, and an explicit min/max still wins over it.
 */
export type DatePreset =
  /** A person's date of birth: historic, never future, never implausibly old. */
  | 'birthdate'
  /** Something that has already happened and happened recently — a blood draw. */
  | 'recent-past'
  /** No opinion: the caller supplies its own bounds, or wants none. */
  | 'any';

/** Nobody alive is older than this, and a typo of 1085 should not be accepted. */
const MAX_AGE_YEARS = 120;
/** Old paper reports get entered, but a "sample date" a decade back is a typo. */
const RECENT_PAST_YEARS = 10;
/** Where a birthdate calendar opens: an adult, not this month. */
const PLAUSIBLE_ADULT_AGE_YEARS = 30;

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Strict: the parsed date has to round-trip. `new Date(2026, 1, 31)` happily
 * rolls forward to 3 March, which would silently accept 31/02/2026 as a real
 * date — on a date of birth that is a wrong answer, not a lenient one.
 */
export function parseISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** How a committed date reads when the field isn't being edited: "14 Mar 1985". */
export function formatDisplayDate(value: string): string {
  const date = parseISODate(value);
  if (!date) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** How the same date reads while it's being typed: "14/03/1985". */
export function formatTypedDate(value: string): string {
  const date = parseISODate(value);
  if (!date) return '';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

/**
 * Two-digit years, resolved the usual way: this year or earlier is this
 * century, anything later is the last one. "14/03/85" is 1985, not 2085.
 */
function expandYear(yy: number, today: Date): number {
  const currentTwoDigit = today.getFullYear() % 100;
  const century = Math.floor(today.getFullYear() / 100) * 100;
  return yy <= currentTwoDigit ? century + yy : century - 100 + yy;
}

/**
 * Someone should be able to type 14/03/1985 straight into the field and be
 * done — no calendar, no clicking. Accepts the separators people actually
 * use, bare digits (14031985), and ISO for anyone pasting a machine date.
 *
 * Returns an ISO string, or null if it isn't a real date. Deliberately
 * unopinionated about range: whether 1885 is *allowed* is the field's
 * business, not the parser's.
 */
export function parseTypedDate(input: string, today = new Date()): string | null {
  const text = input.trim();
  if (!text) return null;

  // ISO first — unambiguous, and the only form where the year leads.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) {
    const [, y, m, d] = iso;
    return normalise(Number(d), Number(m), Number(y));
  }

  const separated = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2}|\d{4})$/.exec(text);
  if (separated) {
    const [, d, m, y] = separated;
    const year = y.length === 2 ? expandYear(Number(y), today) : Number(y);
    return normalise(Number(d), Number(m), year);
  }

  // Bare digits, as typed on a numeric keypad: 14031985 or 140385.
  const bare = /^(\d{2})(\d{2})(\d{2}|\d{4})$/.exec(text);
  if (bare) {
    const [, d, m, y] = bare;
    const year = y.length === 2 ? expandYear(Number(y), today) : Number(y);
    return normalise(Number(d), Number(m), year);
  }

  return null;
}

function normalise(day: number, month: number, year: number): string | null {
  const candidate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return parseISODate(candidate) ? candidate : null;
}

function shiftYears(from: Date, years: number): Date {
  return new Date(from.getFullYear() + years, from.getMonth(), from.getDate());
}

export interface DateBounds {
  /** ISO, inclusive. */
  min?: string;
  max?: string;
}

/**
 * The preset's bounds, with any explicit min/max from the caller taking
 * precedence — a preset is a sensible default, not a cage.
 */
export function resolveBounds(preset: DatePreset, min: string | undefined, max: string | undefined, today = new Date()): DateBounds {
  const defaults: DateBounds =
    preset === 'birthdate'
      ? { min: toISODate(shiftYears(today, -MAX_AGE_YEARS)), max: toISODate(today) }
      : preset === 'recent-past'
        ? { min: toISODate(shiftYears(today, -RECENT_PAST_YEARS)), max: toISODate(today) }
        : {};

  return { min: min ?? defaults.min, max: max ?? defaults.max };
}

/**
 * Where the calendar opens when nothing is selected yet. Opening a date of
 * birth on this month is what made the old field unusable: it left someone
 * born in 1985 roughly five hundred clicks from their own birthday.
 */
export function initialViewDate(preset: DatePreset, bounds: DateBounds, today = new Date()): Date {
  const start = preset === 'birthdate' ? shiftYears(today, -PLAUSIBLE_ADULT_AGE_YEARS) : today;
  const minDate = bounds.min ? parseISODate(bounds.min) : null;
  const maxDate = bounds.max ? parseISODate(bounds.max) : null;
  if (minDate && start < minDate) return minDate;
  if (maxDate && start > maxDate) return maxDate;
  return start;
}
