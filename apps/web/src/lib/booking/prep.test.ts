import { describe, expect, it } from 'vitest';
import { ADD_ONS, PANELS } from './catalogue';
import {
  addWorkingDays,
  combineFasting,
  combinedTurnaround,
  deadlinePhrase,
  fastingInstruction,
  fastingWindow,
  morningOnlyAddOn,
  slotWarnings,
} from './prep';

/**
 * The fasting maths, pinned.
 *
 * This is the one calculation in the booking flow where being wrong costs a
 * patient a morning and the practice a sample, and it is the kind of
 * arithmetic that looks obviously right and lands on the wrong day — an 8am
 * appointment with an 8-hour fast puts the deadline at exactly midnight,
 * which belongs to the evening before in every reader's head and to the
 * following date in `Date`'s.
 */

const panel = (id: string) => PANELS.find((p) => p.id === id)!;
const addOn = (id: string) => ADD_ONS.find((a) => a.id === id)!;

describe('combineFasting', () => {
  it('takes the strictest lower bound across the panel and its add-ons', () => {
    const rule = combineFasting(panel('insight-360'), [addOn('omega-3-index')]);
    expect(rule.required).toBe(true);
    expect(rule.minHours).toBe(10);
    expect(rule.maxHours).toBe(12);
  });

  it('stays un-required when nothing in the selection requires it', () => {
    const rule = combineFasting(panel('nutritional-health-hsc15'), [addOn('amh'), addOn('calprotectin')]);
    expect(rule.required).toBe(false);
    expect(rule.summary).toMatch(/no fasting/i);
  });
});

describe('fastingWindow', () => {
  it('closes the eating window minHours before the appointment', () => {
    // Signature: 8–12 hours, appointment at 10:30 on a Tuesday.
    const w = fastingWindow(combineFasting(panel('signature'), []), '2026-08-11', '10:30')!;
    expect(w.closeBy.getHours()).toBe(2);
    expect(w.closeBy.getMinutes()).toBe(30);
    expect(w.openFrom.getHours()).toBe(22);
    // The 12-hour end falls on the previous evening.
    expect(w.openFrom.getDate()).toBe(10);
  });

  it('returns null when no fasting is required, rather than an empty window', () => {
    expect(fastingWindow(combineFasting(panel('nutritional-health-hsc15'), []), '2026-08-11', '10:30')).toBeNull();
  });
});

describe('deadlinePhrase', () => {
  it('names midnight, and attributes it to the end of the day before', () => {
    // 8am appointment, 8-hour minimum — the deadline is exactly midnight.
    const w = fastingWindow(combineFasting(panel('signature'), []), '2026-08-11', '08:00')!;
    const phrase = deadlinePhrase(w.closeBy);
    expect(phrase).toContain('midnight');
    expect(phrase).not.toContain('12:00am');
    // Monday, not Tuesday — the whole point.
    expect(phrase).toContain('Monday 10 August 2026');
  });

  it('names midday rather than printing 12:00pm', () => {
    const w = fastingWindow(combineFasting(panel('signature'), []), '2026-08-11', '20:00')!;
    expect(deadlinePhrase(w.closeBy)).toBe('midday on Tuesday 11 August 2026');
  });

  it('writes an ordinary time with its own day', () => {
    const w = fastingWindow(combineFasting(panel('insight-360'), []), '2026-08-11', '07:30')!;
    expect(deadlinePhrase(w.closeBy)).toBe('9:30pm on Monday 10 August 2026');
  });
});

describe('fastingInstruction', () => {
  it('names both days when the window crosses midnight', () => {
    const w = fastingWindow(combineFasting(panel('signature'), []), '2026-08-11', '08:00')!;
    const sentence = fastingInstruction(w);
    expect(sentence).toContain('Monday 10 August 2026');
    expect(sentence).toContain('midnight');
  });

  it('names the day once when both ends fall on it', () => {
    const w = fastingWindow(combineFasting(panel('insight-360'), []), '2026-08-11', '07:30')!;
    // 19:30 to 21:30, both on the Monday evening.
    expect(fastingInstruction(w)).toBe(
      'Your last food must be between 7:30pm and 9:30pm on Monday 10 August 2026.',
    );
  });
});

describe('slot timing rules', () => {
  it('blocks Free Testosterone after 10am and leaves earlier slots alone', () => {
    expect(slotWarnings([addOn('free-testosterone')], '10:00')[0]?.blocking).toBe(true);
    expect(slotWarnings([addOn('free-testosterone')], '09:40')).toHaveLength(0);
  });

  it('identifies the add-on that constrains the booking to a morning', () => {
    expect(morningOnlyAddOn([addOn('amh'), addOn('free-testosterone')])?.id).toBe('free-testosterone');
    expect(morningOnlyAddOn([addOn('amh'), addOn('calprotectin')])).toBeNull();
  });
});

describe('turnaround', () => {
  it('adds the slowest add-on to the panel, not the sum of them', () => {
    const { days } = combinedTurnaround(panel('signature'), [addOn('omega-3-index'), addOn('calprotectin')]);
    expect(days).toEqual([6, 7]);
  });

  it('skips weekends when projecting a results date', () => {
    // Friday 7 August 2026 + 2 working days lands on the Tuesday.
    expect(addWorkingDays('2026-08-07', 2)).toBe('2026-08-11');
  });
});
