import type { AddOn, BookingLocation, Panel } from './types';

/**
 * Aspire's product catalogue — what is offered, what it covers, and how a
 * patient has to prepare for it.
 *
 * This is deliberately *not* part of the mock. The panel names, the covering
 * copy, the fasting rules and the two location descriptions are Aspire's own
 * content and stay true after the Randox API lands; the real service can keep
 * serving them from here, or start returning them over the wire, without any
 * of it changing shape. Only availability and appointments are Randox's to
 * provide, and those are the parts that live behind the service interface.
 *
 * Marker counts, turnarounds and fasting windows follow the panel
 * specifications; anything genuinely variable (sex-specific hormone markers)
 * carries a note rather than a false precision.
 */

const NO_FASTING = {
  required: false,
  minHours: 0,
  maxHours: 0,
  summary: 'No fasting needed. Eat and drink normally beforehand.',
} as const;

export const PANELS: Panel[] = [
  {
    id: 'insight-360',
    name: 'Insight 360',
    strapline: 'The most complete picture we offer: a full sweep across every major system in one draw.',
    covers: [
      'Full blood count',
      'Liver function',
      'Kidney function',
      'Cholesterol and lipids',
      'Blood sugar and HbA1c',
      'Thyroid',
      'Vitamins and minerals',
      'Inflammation',
    ],
    markerCount: 40,
    turnaround: '5–7 working days',
    turnaroundDays: [5, 7],
    fasting: {
      required: true,
      minHours: 10,
      maxHours: 12,
      summary: 'Fast for 10 to 12 hours. Water only.',
    },
    timingNotes: [
      {
        label: 'Morning appointment recommended',
        detail:
          'The overnight fast is far easier to complete if the draw is early, and several markers in this panel are steadiest first thing.',
        critical: false,
      },
    ],
    appointmentMinutes: 20,
  },
  {
    id: 'signature',
    name: 'Signature',
    strapline: 'A focused general health check: blood count, the key organ functions, and cardiovascular markers.',
    covers: [
      'Full blood count',
      'Liver function',
      'Kidney function',
      'Cholesterol and lipids',
      'Blood sugar',
      'Thyroid',
    ],
    markerCount: 12,
    turnaround: '2–3 working days',
    turnaroundDays: [2, 3],
    fasting: {
      required: true,
      minHours: 8,
      maxHours: 12,
      summary: 'Fast for 8 to 12 hours. Water only.',
    },
    timingNotes: [],
    appointmentMinutes: 15,
  },
  {
    id: 'advanced-gp3',
    name: 'Advanced GP3',
    strapline: 'A comprehensive check spanning organ function, cardiovascular and metabolic health, and sex hormones.',
    covers: [
      'Liver function',
      'Kidney function',
      'Cholesterol and lipids',
      'Blood sugar and HbA1c',
      'Thyroid',
      'Sex hormones',
      'Vitamins',
    ],
    markerCount: 22,
    markerCountNote: '23 for women. The hormone markers in this panel are matched to your sex.',
    turnaround: '3–5 working days',
    turnaroundDays: [3, 5],
    fasting: {
      required: true,
      minHours: 8,
      maxHours: 12,
      summary: 'Fast for 8 to 12 hours. Water only.',
    },
    timingNotes: [
      {
        label: 'Before 10am if you can',
        detail:
          'Testosterone peaks in the morning and falls through the day. An afternoon sample can read low for no reason other than the time it was taken.',
        critical: true,
      },
      {
        label: 'Cycle timing, if it applies to you',
        detail:
          'If you have a menstrual cycle, days 2 to 5 give the most interpretable oestradiol and FSH. If that is not possible, tell us the day you are on and we will read the result against it.',
        critical: true,
      },
    ],
    appointmentMinutes: 20,
  },
  {
    id: 'nutritional-health-hsc15',
    name: 'Nutritional Health HSC15',
    strapline: 'Vitamin, mineral and nutritional status: what your diet and absorption are actually delivering.',
    covers: [
      'Vitamin D',
      'B12 and folate',
      'Iron and ferritin',
      'Calcium and magnesium',
      'Zinc',
      'Protein status',
      'Long-term blood sugar',
    ],
    markerCount: 15,
    turnaround: '5–7 working days',
    turnaroundDays: [5, 7],
    fasting: { ...NO_FASTING },
    timingNotes: [
      {
        label: 'Pause supplements for 48 hours',
        detail:
          'Biotin, high-dose B12 and iron supplements can all read back as your supplement rather than your body. Stop them two days before, unless a clinician has told you otherwise. Never stop a prescribed medicine on our say-so.',
        critical: true,
      },
    ],
    appointmentMinutes: 15,
  },
];

export const ADD_ONS: AddOn[] = [
  {
    id: 'omega-3-index',
    name: 'Omega-3 Index',
    strapline: 'The proportion of omega-3 in your red blood cell membranes.',
    detail:
      'A longer-range measure than a one-off fatty acid reading. It reflects roughly the last three months, so it responds to what you actually eat rather than what you ate this week.',
    sampleType: 'SAME_DRAW',
    fasting: { ...NO_FASTING },
    timingNotes: [],
    addsTurnaroundDays: 2,
  },
  {
    id: 'amh',
    name: 'AMH (Anti-Müllerian Hormone)',
    strapline: 'A measure of remaining ovarian reserve.',
    detail:
      'Useful context for fertility planning. It can be taken on any day of your cycle, so it adds nothing to the timing of your appointment.',
    sampleType: 'SAME_DRAW',
    fasting: { ...NO_FASTING },
    timingNotes: [
      {
        label: 'Any day of your cycle',
        detail: 'Unlike oestradiol and FSH, AMH is stable across the cycle, so there is no timing to plan around.',
        critical: false,
      },
    ],
    addsTurnaroundDays: 2,
  },
  {
    id: 'free-testosterone',
    name: 'Free Testosterone',
    strapline: 'The portion of testosterone your body can actually use.',
    detail:
      'Often explains symptoms better than total testosterone alone, particularly where SHBG is high or low.',
    sampleType: 'SAME_DRAW',
    fasting: { ...NO_FASTING },
    timingNotes: [
      {
        label: 'Morning sample required',
        detail:
          'Testosterone follows a daily rhythm and drops substantially by the afternoon. This add-on needs a slot before 10am to produce a result worth reading.',
        critical: true,
      },
    ],
    addsTurnaroundDays: 1,
  },
  {
    id: 'calprotectin',
    name: 'Calprotectin',
    strapline: 'Inflammation specifically within the gut.',
    detail:
      'This one is not taken from your blood. We post you a collection kit for a stool sample, which you complete at home and return in the prepaid envelope, separately from your appointment.',
    sampleType: 'HOME_KIT',
    fasting: { ...NO_FASTING },
    timingNotes: [
      {
        label: 'Collected at home, not at your appointment',
        detail:
          'The kit is posted within two working days of booking. Your blood draw goes ahead as normal; the gut sample follows whenever suits you.',
        critical: false,
      },
    ],
    addsTurnaroundDays: 4,
  },
];

export const LOCATIONS: BookingLocation[] = [
  {
    id: 'aspire-mortimer-street',
    kind: 'ASPIRE_CLINIC',
    name: 'Aspire Clinic, Mortimer Street',
    addressLines: ['27 Mortimer Street', 'London', 'W1T 3JE'],
    travelNote: 'Two minutes from Goodge Street, five from Oxford Circus. No parking on site.',
    openingSummary: 'Monday to Friday, 7:30am–5:30pm · Saturday mornings',
    facts: [
      { label: 'Who takes your sample', value: 'An Aspire nurse who has your history in front of them' },
      { label: 'How long to allow', value: 'About 20 minutes, including the questions either side' },
      { label: 'When you can come', value: 'Weekdays from 7:30am, plus Saturday mornings' },
      { label: 'Getting to the lab', value: 'Couriered to the laboratory the same afternoon' },
      { label: 'All four add-ons', value: 'Available here' },
    ],
    unavailableAddOnIds: [],
  },
  {
    id: 'randox-london-city',
    kind: 'RANDOX_CLINIC',
    name: 'Randox Health, London City',
    addressLines: ['Adam’s Court', 'London', 'EC2N 1DX'],
    travelNote: 'Three minutes from Bank, six from Liverpool Street.',
    openingSummary: 'Seven days a week, 7:00am–7:00pm (Sundays 9:00am–3:00pm)',
    facts: [
      { label: 'Who takes your sample', value: 'A Randox phlebotomist, who will not have your Aspire history' },
      { label: 'How long to allow', value: 'About 15 minutes' },
      { label: 'When you can come', value: 'Seven days a week, early mornings and evenings' },
      { label: 'Getting to the lab', value: 'Processed on site, usually a day quicker' },
      { label: 'All four add-ons', value: 'Calprotectin is posted to you instead' },
    ],
    unavailableAddOnIds: ['calprotectin'],
  },
  {
    id: 'randox-london-fulham',
    kind: 'RANDOX_CLINIC',
    name: 'Randox Health, Fulham',
    addressLines: ['Fulham Broadway', 'London', 'SW6 1BW'],
    travelNote: 'Directly above Fulham Broadway station.',
    openingSummary: 'Seven days a week, 7:00am–7:00pm (Sundays 9:00am–3:00pm)',
    facts: [
      { label: 'Who takes your sample', value: 'A Randox phlebotomist, who will not have your Aspire history' },
      { label: 'How long to allow', value: 'About 15 minutes' },
      { label: 'When you can come', value: 'Seven days a week, early mornings and evenings' },
      { label: 'Getting to the lab', value: 'Processed on site, usually a day quicker' },
      { label: 'All four add-ons', value: 'Calprotectin is posted to you instead' },
    ],
    unavailableAddOnIds: ['calprotectin'],
  },
  {
    id: 'randox-manchester',
    kind: 'RANDOX_CLINIC',
    name: 'Randox Health, Manchester',
    addressLines: ['King Street', 'Manchester', 'M2 4NH'],
    travelNote: 'Ten minutes from Piccadilly, five from St Peter’s Square.',
    openingSummary: 'Seven days a week, 7:00am–7:00pm (Sundays 9:00am–3:00pm)',
    facts: [
      { label: 'Who takes your sample', value: 'A Randox phlebotomist, who will not have your Aspire history' },
      { label: 'How long to allow', value: 'About 15 minutes' },
      { label: 'When you can come', value: 'Seven days a week, early mornings and evenings' },
      { label: 'Getting to the lab', value: 'Processed on site, usually a day quicker' },
      { label: 'All four add-ons', value: 'Calprotectin is posted to you instead' },
    ],
    unavailableAddOnIds: ['calprotectin'],
  },
];

/**
 * Whichever clinic takes the sample, the result comes back to the Aspire
 * clinical team and is reviewed before anything is published — nothing
 * auto-publishes. Stated once, next to the choice, so picking a Randox clinic
 * never reads as picking a different standard of care.
 */
export const SHARED_LOCATION_TRUTH =
  'Wherever your sample is taken, it comes back to the Aspire clinical team first. A clinician reviews every result before it appears in your portal.';

export function findPanel(panels: Panel[], id: string | null): Panel | null {
  return panels.find((p) => p.id === id) ?? null;
}

export function findLocation(locations: BookingLocation[], id: string | null): BookingLocation | null {
  return locations.find((l) => l.id === id) ?? null;
}
