import { formatDate } from '@aspire-bloods/shared';
import type { AddOn, BookingLocation, FastingRule, Panel, TimingNote } from './types';

/**
 * Pure derivations over the catalogue — no I/O, no service, no React. These
 * survive the swap to the real Randox API untouched, and they are where the
 * fasting rule stops being a sentence and becomes a specific instruction with
 * a clock time on it.
 *
 * The reason that matters: "fast for 10 to 12 hours" asks a patient to do
 * arithmetic against an appointment time they may have booked three weeks
 * earlier, at the exact moment they are least likely to do it carefully —
 * late at night, hungry. "Your last food must be between 20:30 and 22:30
 * tonight" cannot be got wrong.
 */

/* ── time plumbing ──────────────────────────────────────────────────────── */

/** `YYYY-MM-DD` + `HH:MM`, both clinic-local, to a Date. */
export function slotDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

/** `08:30` → `8:30am`. The portal writes times the way people say them. */
export function formatClockTime(value: Date | string): string {
  const d = typeof value === 'string' ? slotDateTime('2000-01-01', value) : value;
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const suffix = hours < 12 ? 'am' : 'pm';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${minutes}${suffix}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Monday 10 August 2026" — the portal's long date, with the weekday people plan by. */
export function formatWeekdayDate(iso: string): string {
  const d = slotDateTime(iso, '12:00');
  return `${WEEKDAYS[d.getDay()]} ${formatDate(iso)}`;
}

/** "Mon 10 Aug" — for the date strip, where the full form will not fit at 375px. */
export function formatStripDate(iso: string): { weekday: string; day: string; month: string } {
  const d = slotDateTime(iso, '12:00');
  return {
    weekday: WEEKDAYS[d.getDay()].slice(0, 3),
    day: String(d.getDate()),
    month: d.toLocaleDateString('en-GB', { month: 'short' }),
  };
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const d = slotDateTime(iso, '12:00');
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** Calendar days between two ISO dates, positive when `b` is later. */
export function daysBetween(a: string, b: string): number {
  return Math.round((slotDateTime(b, '12:00').getTime() - slotDateTime(a, '12:00').getTime()) / 86_400_000);
}

/** "in 3 days" / "tomorrow" / "today" — how far off an appointment is. */
export function relativeDayLabel(iso: string): string {
  const days = daysBetween(todayIso(), iso);
  if (days < 0) return days === -1 ? 'yesterday' : `${Math.abs(days)} days ago`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30.4)} months`;
}

/* ── fasting ────────────────────────────────────────────────────────────── */

/**
 * The strictest rule wins. None of the four add-ons currently requires
 * fasting, but the combination is resolved rather than assumed — an add-on
 * that does require it later must not be able to slip through because the
 * panel happened not to.
 */
export function combineFasting(panel: Panel | null, addOns: AddOn[]): FastingRule {
  const rules = [panel?.fasting, ...addOns.map((a) => a.fasting)].filter(
    (r): r is FastingRule => !!r && r.required,
  );
  if (rules.length === 0) {
    return {
      required: false,
      minHours: 0,
      maxHours: 0,
      summary: 'No fasting needed. Eat and drink normally beforehand.',
    };
  }
  const minHours = Math.max(...rules.map((r) => r.minHours));
  // The tightest upper bound that still clears every lower bound. Fasting for
  // longer than the window skews results as surely as not fasting at all.
  const maxHours = Math.max(minHours, Math.min(...rules.map((r) => r.maxHours)));
  return {
    required: true,
    minHours,
    maxHours,
    summary: `Fast for ${minHours} to ${maxHours} hours. Water only.`,
  };
}

export interface FastingWindow {
  /** Do not have your last food before this — fasting too long skews results. */
  openFrom: Date;
  /** Your last food must be at or before this. */
  closeBy: Date;
  /** True when the window falls on the day before the appointment (it usually does). */
  nightBefore: boolean;
  rule: FastingRule;
}

/**
 * Turns "fast for 10 to 12 hours" plus a booked slot into the two clock times
 * that actually constrain a patient: the earliest and latest their last food
 * can be. Returns null when no fasting is required, so call sites branch on
 * presence rather than on a boolean plus five fields.
 */
export function fastingWindow(rule: FastingRule, date: string, time: string): FastingWindow | null {
  if (!rule.required) return null;
  const appointment = slotDateTime(date, time);
  const closeBy = new Date(appointment.getTime() - rule.minHours * 3_600_000);
  const openFrom = new Date(appointment.getTime() - rule.maxHours * 3_600_000);
  return {
    openFrom,
    closeBy,
    nightBefore: toIsoDate(closeBy) !== date,
    rule,
  };
}

/**
 * A moment, named so that it cannot be read as any other moment: "10:30pm on
 * Monday 10 August".
 *
 * Two cases earn the special handling. Midnight is never printed as "12:00am"
 * — half of readers take that for noon, and it is attributed to the *end* of
 * the day before, which is how anyone planning an evening meal thinks about
 * it. An 8-hour fast before an 8am appointment lands exactly there, so this
 * is the common case, not a corner one. Midday gets the same treatment for
 * the same reason.
 */
export function deadlinePhrase(d: Date): string {
  const hours = d.getHours();
  const minutes = d.getMinutes();
  if (hours === 0 && minutes === 0) {
    const endOfPreviousDay = new Date(d.getTime() - 60_000);
    return `midnight, at the end of ${formatWeekdayDate(toIsoDate(endOfPreviousDay))}`;
  }
  if (hours === 12 && minutes === 0) return `midday on ${formatWeekdayDate(toIsoDate(d))}`;
  return `${formatClockTime(d)} on ${formatWeekdayDate(toIsoDate(d))}`;
}

/**
 * The single sentence that has to land: when to stop eating, on which day.
 * Written as a window because both ends are real constraints.
 *
 * Both ends are named with their day whenever the window crosses midnight,
 * which it routinely does — an 8-to-12-hour fast before an 8am appointment
 * runs from 8pm one day to midnight the next. Naming one day for both ends
 * would put the earlier time on the wrong date.
 */
export function fastingInstruction(window: FastingWindow): string {
  const sameDay = toIsoDate(window.openFrom) === toIsoDate(window.closeBy);
  if (sameDay) {
    return `Your last food must be between ${formatClockTime(window.openFrom)} and ${deadlinePhrase(window.closeBy)}.`;
  }
  return `Your last food must be between ${deadlinePhrase(window.openFrom)} and ${deadlinePhrase(window.closeBy)}.`;
}

/** What is still allowed during the fast — asked every single time. */
export const FASTING_ALLOWANCES: { allowed: boolean; label: string; detail: string }[] = [
  { allowed: true, label: 'Water', detail: 'Plain water, as much as you like. Being well hydrated makes the draw easier.' },
  { allowed: true, label: 'Your usual medication', detail: 'Keep taking anything prescribed unless a clinician has told you otherwise. Never stop a prescribed medicine to prepare for a test.' },
  { allowed: false, label: 'Tea and coffee', detail: 'Including black, and including decaf. Both move glucose and lipid results.' },
  { allowed: false, label: 'Juice, milk, and fizzy drinks', detail: 'Anything with calories in it ends the fast.' },
  { allowed: false, label: 'Chewing gum and mints', detail: 'Sugar-free included. They still trigger a digestive response.' },
  { allowed: false, label: 'Alcohol, for 24 hours', detail: 'Alcohol affects liver markers and triglycerides for longer than an overnight fast.' },
];

/* ── other preparation ──────────────────────────────────────────────────── */

/** Every non-fasting timing note across the selection, most consequential first. */
export function timingNotesFor(panel: Panel | null, addOns: AddOn[]): TimingNote[] {
  const notes = [...(panel?.timingNotes ?? []), ...addOns.flatMap((a) => a.timingNotes)];
  const seen = new Set<string>();
  return notes
    .filter((n) => (seen.has(n.label) ? false : (seen.add(n.label), true)))
    .sort((a, b) => Number(b.critical) - Number(a.critical));
}

/** Add-ons that are not taken at the appointment at all — a kit arrives in the post. */
export function homeKitAddOns(addOns: AddOn[]): AddOn[] {
  return addOns.filter((a) => a.sampleType === 'HOME_KIT');
}

/**
 * Free Testosterone follows a daily rhythm steep enough that an afternoon
 * sample is not a slightly worse result, it is an uninterpretable one. This
 * is checked against the chosen slot rather than left as advice.
 */
export const MORNING_CUTOFF_HOUR = 10;

export interface SlotWarning {
  addOnId: string;
  /** Blocking warnings stop the booking; the rest are shown and can be accepted. */
  blocking: boolean;
  message: string;
}

export function slotWarnings(addOns: AddOn[], time: string): SlotWarning[] {
  const hour = Number(time.slice(0, 2));
  const warnings: SlotWarning[] = [];
  if (addOns.some((a) => a.id === 'free-testosterone') && hour >= MORNING_CUTOFF_HOUR) {
    warnings.push({
      addOnId: 'free-testosterone',
      blocking: true,
      message: `Free Testosterone needs a slot before ${MORNING_CUTOFF_HOUR}am. Testosterone falls through the day, so a ${formatClockTime(
        time,
      )} sample would not give a result worth reading. Pick an earlier time, or remove the add-on.`,
    });
  }
  return warnings;
}

/**
 * The add-on, if any, that constrains the whole booking to a morning slot.
 * Derived from `slotWarnings` rather than from a second list of ids, so the
 * picker and the validation can never disagree about which add-on it is.
 */
export function morningOnlyAddOn(addOns: AddOn[]): AddOn | null {
  return addOns.find((a) => slotWarnings([a], '12:00').some((w) => w.blocking)) ?? null;
}

/** Add-ons the chosen location cannot take a sample for, with what happens instead. */
export function addOnsRedirectedAt(location: BookingLocation | null, addOns: AddOn[]): AddOn[] {
  if (!location) return [];
  return addOns.filter((a) => location.unavailableAddOnIds.includes(a.id));
}

/* ── turnaround ─────────────────────────────────────────────────────────── */

/** The slowest thing in the basket sets the wait, plus whatever the add-ons add. */
export function combinedTurnaround(panel: Panel | null, addOns: AddOn[]): { label: string; days: [number, number] } {
  if (!panel) return { label: '—', days: [0, 0] };
  const extra = addOns.reduce((max, a) => Math.max(max, a.addsTurnaroundDays), 0);
  const days: [number, number] = [panel.turnaroundDays[0] + extra, panel.turnaroundDays[1] + extra];
  return { label: `${days[0]}–${days[1]} working days`, days };
}

/** Working days forward from an ISO date, skipping weekends. */
export function addWorkingDays(iso: string, days: number): string {
  let cursor = iso;
  let remaining = days;
  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    const day = slotDateTime(cursor, '12:00').getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return cursor;
}

/** "between 17 and 19 August" — when to expect results, from the appointment date. */
export function expectedResultsLabel(panel: Panel | null, addOns: AddOn[], date: string): string {
  const { days } = combinedTurnaround(panel, addOns);
  if (days[1] === 0) return '—';
  const from = addWorkingDays(date, days[0]);
  const to = addWorkingDays(date, days[1]);
  return `between ${formatDate(from)} and ${formatDate(to)}`;
}
