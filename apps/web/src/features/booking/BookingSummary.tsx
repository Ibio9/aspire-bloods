import { PinIcon } from '../../components/nav/patientIcons';
import {
  combinedTurnaround,
  expectedResultsLabel,
  formatClockTime,
  formatWeekdayDate,
  homeKitAddOns,
  timingNotesFor,
} from '../../lib/booking/prep';
import type { AddOn, BookingLocation, Panel } from '../../lib/booking/types';
import { FastingNotice } from './FastingNotice';
import { CalendarIcon, ClockIcon, HomeKitIcon } from './bookingIcons';

/**
 * What's booked, where, when, and what to do beforehand — the four questions
 * the confirmation has to answer, in that order.
 *
 * Shared by the review step, the confirmation screen and the appointment
 * detail page, so the thing a patient checks before confirming is literally
 * the same component as the thing they check afterwards. Two summaries that
 * are meant to agree and are written twice will eventually disagree.
 */

interface BookingSummaryProps {
  panel: Panel;
  addOns: AddOn[];
  location: BookingLocation;
  date: string;
  time: string;
  durationMinutes: number;
  /** Rendered next to each section heading — "Change" links on review, nothing on confirmation. */
  onEdit?: { test?: () => void; location?: () => void; slot?: () => void };
}

export function BookingSummary({ panel, addOns, location, date, time, durationMinutes, onEdit }: BookingSummaryProps) {
  const kits = homeKitAddOns(addOns);
  const drawnHere = addOns.filter((a) => a.sampleType === 'SAME_DRAW');
  const turnaround = combinedTurnaround(panel, addOns);
  const criticalNotes = timingNotesFor(panel, addOns).filter((n) => n.critical);

  return (
    <div className="flex flex-col gap-8">
      {/* ── what ────────────────────────────────────────────────────────── */}
      <Section title="What you’re having" onEdit={onEdit?.test} editLabel="your test">
        <p className="font-display text-xl leading-tight text-espresso sm:text-2xl">{panel.name}</p>
        <p className="tabular mt-2 text-sm text-espresso/85">
          {panel.markerCount} markers · results in {turnaround.label}
        </p>
        {drawnHere.length > 0 && (
          <p className="mt-4 text-reading leading-relaxed text-espresso">
            With <span className="font-medium">{drawnHere.map((a) => a.name).join(', ')}</span> from the same draw.
          </p>
        )}
        {kits.length > 0 && (
          <p className="mt-3 flex items-start gap-2.5 text-reading leading-relaxed text-espresso">
            <HomeKitIcon className="mt-1 shrink-0 text-bronze-700" />
            <span>
              <span className="font-medium">{kits.map((a) => a.name).join(', ')}</span>: a kit posted to you within
              two working days, collected at home rather than at this appointment.
            </span>
          </p>
        )}
      </Section>

      {/* ── where ───────────────────────────────────────────────────────── */}
      <Section title="Where" onEdit={onEdit?.location} editLabel="the clinic">
        <p className="font-display text-xl leading-tight text-espresso">{location.name}</p>
        <p className="mt-3 flex items-start gap-2.5 text-reading text-espresso">
          <PinIcon className="mt-1 shrink-0 text-bronze-700" />
          <span className="not-italic">
            {location.addressLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </span>
        </p>
        <p className="mt-3 text-sm leading-relaxed text-espresso/85">{location.travelNote}</p>
      </Section>

      {/* ── when ────────────────────────────────────────────────────────── */}
      <Section title="When" onEdit={onEdit?.slot} editLabel="the time">
        <p className="flex items-start gap-2.5">
          <CalendarIcon className="mt-1.5 shrink-0 text-bronze-700" />
          <span className="font-display text-xl leading-tight text-espresso sm:text-2xl">
            {formatWeekdayDate(date)}
          </span>
        </p>
        <p className="tabular mt-3 flex items-center gap-2.5 text-reading text-espresso">
          <ClockIcon className="shrink-0 text-bronze-700" />
          {formatClockTime(time)}. Allow about {durationMinutes} minutes.
        </p>
      </Section>

      {/* ── before you come ─────────────────────────────────────────────── */}
      <Section title="Before you come">
        <FastingNotice panel={panel} addOns={addOns} date={date} time={time} variant="summary" />
        {criticalNotes.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2.5">
            {criticalNotes.map((note) => (
              <li key={note.label} className="text-reading leading-relaxed text-espresso">
                <span className="font-medium">{note.label}.</span> {note.detail}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── after ───────────────────────────────────────────────────────── */}
      <Section title="Afterwards">
        <p className="text-reading leading-relaxed text-espresso">
          Expect your results {expectedResultsLabel(panel, addOns, date)}. They come back to the Aspire clinical team
          first. A clinician reviews every result before it appears in your portal, and we’ll email you the moment it
          does.
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  onEdit,
  editLabel,
}: {
  title: string;
  children: React.ReactNode;
  onEdit?: () => void;
  editLabel?: string;
}) {
  return (
    <section className="border-b border-taupe pb-8 last:border-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-4">
        {/* Styled as an eyebrow but marked up as a real heading — these are
            the five sections of the page, and both consumers put them one
            level below their own h1. */}
        <h2 className="eyebrow">{title}</h2>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="-my-2 -mr-2 min-h-tap rounded-full px-3 text-sm font-medium text-bronze-700 underline-offset-4 transition duration-150 ease-out hover:underline"
          >
            Change<span className="sr-only"> {editLabel}</span>
          </button>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
