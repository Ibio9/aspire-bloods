import { useId } from 'react';
import {
  FASTING_ALLOWANCES,
  combineFasting,
  deadlinePhrase,
  fastingInstruction,
  fastingWindow,
  formatClockTime,
} from '../../lib/booking/prep';
import type { AddOn, Panel } from '../../lib/booking/types';
import { AlertIcon, CrossIcon, FoodOkIcon, NoFoodIcon, TickIcon } from './bookingIcons';

/**
 * Fasting, made impossible to miss.
 *
 * Getting this wrong is the single most expensive mistake in the whole flow:
 * the patient loses a morning, the practice loses a phlebotomy slot, and the
 * sample is drawn and then thrown away. So this component does three things
 * that a paragraph of instructions does not.
 *
 *  1. It states a **clock time on a named day**, computed from the slot the
 *     patient actually booked — not a number of hours they have to subtract
 *     from their appointment at 11pm while hungry.
 *  2. It is the **darkest surface in the product**. Everything else in the
 *     portal is cream on cream; this is espresso, and it reads as a different
 *     kind of statement at a glance, before a word of it is read.
 *  3. It carries the consequence, in plain words, at the bottom. "8–12 hours
 *     fasted" does not tell anyone what happens if they don't.
 *
 * The no-fasting case is deliberately given the same footprint and its own
 * positive statement rather than being omitted. An absent notice is
 * ambiguous — it could mean "no fasting" or it could mean the page failed to
 * tell you. A present one that says "eat normally" cannot be misread, and the
 * contrast is what makes the dark one land when it does appear.
 */

interface FastingNoticeProps {
  panel: Panel | null;
  addOns: AddOn[];
  /** Omitted before a slot is chosen — the notice falls back to the rule in hours. */
  date?: string;
  time?: string;
  variant?: 'full' | 'summary';
  className?: string;
}

export function FastingNotice({ panel, addOns, date, time, variant = 'full', className = '' }: FastingNoticeProps) {
  const rule = combineFasting(panel, addOns);
  const window = date && time ? fastingWindow(rule, date, time) : null;
  // Generated rather than fixed: a screen can legitimately hold two of these
  // (a booking's own notice plus a comparison), and two elements sharing an
  // id silently breaks the aria-labelledby on both.
  const headingId = useId();

  if (variant === 'summary') {
    return <FastingSummary rule={rule} window={window} className={className} />;
  }

  return rule.required ? (
    <FastingRequired
      headingId={headingId}
      rule={rule}
      window={window}
      appointmentTime={time}
      panelName={panel?.name ?? 'this panel'}
      className={className}
    />
  ) : (
    <NoFastingNeeded headingId={headingId} panelName={panel?.name ?? 'this panel'} className={className} />
  );
}

/* ── the dark one ───────────────────────────────────────────────────────── */

function FastingRequired({
  headingId,
  rule,
  window,
  appointmentTime,
  panelName,
  className,
}: {
  headingId: string;
  rule: ReturnType<typeof combineFasting>;
  window: ReturnType<typeof fastingWindow>;
  appointmentTime?: string;
  panelName: string;
  className: string;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className={`overflow-hidden rounded-card border border-night bg-night text-oncolor shadow-card ${className}`}
    >
      <div className="p-6 sm:p-9">
        <p className="flex items-center gap-2.5 font-eyebrow text-lg uppercase tracking-eyebrow text-oncolor/80">
          <NoFoodIcon className="shrink-0" />
          Before this appointment
        </p>

        {window ? (
          <>
            {/* The headline is the instruction itself — a time and a day, in
                display type, at the size the page's own title would be. */}
            <h2 id={headingId} className="mt-4 font-display text-2xl leading-[1.08] sm:text-3xl">
              Nothing to eat after <span className="tabular">{deadlinePhrase(window.closeBy)}</span>
            </h2>
            <p className="mt-5 max-w-2xl text-reading leading-relaxed text-oncolor/90">
              {panelName} needs {rule.minHours} to {rule.maxHours} hours without food, and your appointment is at{' '}
              <span className="tabular font-medium text-oncolor">{formatClockTime(appointmentTime ?? '00:00')}</span>.{' '}
              {fastingInstruction(window)} Fasting for longer than {rule.maxHours} hours skews the results as surely
              as not fasting at all, so don’t start early to be safe.
            </p>
          </>
        ) : (
          <>
            <h2 id={headingId} className="mt-4 font-display text-2xl leading-[1.08] sm:text-3xl">
              You’ll need to fast for{' '}
              <span className="tabular whitespace-nowrap">
                {rule.minHours}–{rule.maxHours} hours
              </span>
            </h2>
            <p className="mt-5 max-w-2xl text-reading leading-relaxed text-oncolor/90">
              {panelName} measures things that food moves within minutes: blood sugar and triglycerides most of all.
              Once you’ve picked a time we’ll tell you the exact hour to stop eating, so there is nothing for you to
              work out.
            </p>
          </>
        )}
      </div>

      <div className="border-t border-oncolor/20 p-6 sm:p-9">
        <p className="font-eyebrow text-lg uppercase tracking-eyebrow text-oncolor/80">During the fast</p>
        {/* Tick and cross are shape-distinct and each row names its own state
            in words — the two halves never rely on colour to separate. */}
        <ul className="mt-4 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
          {FASTING_ALLOWANCES.map((item) => (
            <li key={item.label} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  item.allowed ? 'bg-oncolor text-night' : 'border border-oncolor/50 text-oncolor'
                }`}
              >
                {item.allowed ? <TickIcon className="h-3 w-3" /> : <CrossIcon className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-reading font-medium text-oncolor">
                  <span className="sr-only">{item.allowed ? 'Allowed: ' : 'Not allowed: '}</span>
                  {item.label}
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-oncolor/80">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* One tone deeper than the panel above it (ink, not black — the palette
          has no pure black) so the consequence reads as a separate statement
          rather than a fourth paragraph. */}
      <div className="flex items-start gap-3 border-t border-oncolor/20 bg-ink p-6 sm:px-9">
        <AlertIcon className="mt-0.5 shrink-0 text-oncolor" />
        <p className="text-reading leading-relaxed text-oncolor">
          <span className="font-medium">If you eat, we can’t use the sample.</span> The draw would go ahead and the
          results would be misleading, so we’d have to ask you back for a second appointment. If you slip up, tell the
          phlebotomist when you arrive. Rebooking on the day costs you nothing.
        </p>
      </div>
    </section>
  );
}

/* ── the calm one ───────────────────────────────────────────────────────── */

function NoFastingNeeded({ headingId, panelName, className }: { headingId: string; panelName: string; className: string }) {
  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-card border border-taupe bg-cream-100 p-6 shadow-card sm:p-9 ${className}`}
    >
      <p className="flex items-center gap-2.5 font-eyebrow text-lg uppercase tracking-eyebrow text-espresso/80">
        <FoodOkIcon className="shrink-0 text-bronze-700" />
        Before this appointment
      </p>
      <h2 id={headingId} className="mt-4 font-display text-2xl leading-tight text-espresso sm:text-2xl">
        No fasting needed
      </h2>
      <p className="mt-4 max-w-2xl text-reading leading-relaxed text-espresso/90">
        Eat and drink as you normally would before your appointment. Nothing in {panelName} is moved by a meal, so
        there is no window to plan around. Come as you are. Being well hydrated makes the draw itself quicker and
        more comfortable, so a glass of water beforehand is worth it.
      </p>
    </section>
  );
}

/* ── the compact one ────────────────────────────────────────────────────── */

/** For appointment cards and lists, where the full notice would overwhelm the row it sits in. */
function FastingSummary({
  rule,
  window,
  className,
}: {
  rule: ReturnType<typeof combineFasting>;
  window: ReturnType<typeof fastingWindow>;
  className: string;
}) {
  if (!rule.required) {
    return (
      <p className={`flex items-start gap-2.5 text-sm text-espresso/85 ${className}`}>
        <FoodOkIcon className="mt-px h-4 w-4 shrink-0 text-bronze-700" />
        <span>No fasting needed. Eat and drink normally.</span>
      </p>
    );
  }

  return (
    <p
      className={`flex items-start gap-2.5 rounded-input bg-night px-3.5 py-3 text-sm text-oncolor ${className}`}
    >
      <NoFoodIcon className="mt-px h-4 w-4 shrink-0" />
      <span>
        {window ? (
          <>
            <span className="tabular font-medium">Nothing to eat after {deadlinePhrase(window.closeBy)}.</span>{' '}
            <span className="text-oncolor/85">Water and your usual medication are fine.</span>
          </>
        ) : (
          <span className="font-medium">
            Fasting required: {rule.minHours} to {rule.maxHours} hours, water only.
          </span>
        )}
      </span>
    </p>
  );
}
