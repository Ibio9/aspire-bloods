import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { bookingService } from '../../lib/booking/bookingService';
import {
  MORNING_CUTOFF_HOUR,
  addDays,
  daysBetween,
  formatClockTime,
  formatStripDate,
  formatWeekdayDate,
  todayIso,
} from '../../lib/booking/prep';
import type { AvailabilityResponse, DayAvailability, Slot } from '../../lib/booking/types';
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon } from './bookingIcons';

/**
 * Date strip plus slot grid. Used by the booking flow's third step and, in
 * full, by the reschedule screen — moving an appointment is the same problem
 * as booking one, and giving it a second, subtly different picker would be a
 * way to introduce a second, subtly different set of bugs.
 *
 * Both the date and the time are real radio groups built on hidden `<input
 * type="radio">` elements with `peer-*` siblings carrying the paint — the
 * same construction as `ui/Radio` and `ui/Checkbox`. That is what gives
 * arrow-key navigation within the group, a single tab stop, and a correctly
 * announced "3 of 14" for free; a grid of `<button aria-pressed>` would have
 * to reimplement all three and would still announce as a toolbar.
 *
 * A day with nothing on it never renders as an empty grid. Every empty state
 * carries the reason it is empty and, where one exists, a jump to the next
 * date that isn't.
 */

const WINDOW_DAYS = 7;

/** Matches the mock service's lead time; the real one reports its own via availability. */
const MIN_LEAD_DAYS = 2;

interface SlotPickerProps {
  locationId: string;
  panelId: string;
  addOnIds: string[];
  value: Slot | null;
  onChange: (slot: Slot) => void;
  /** Drives the "easier fast" hint on early slots. */
  fastingRequired: boolean;
  /** Name of an add-on that needs a pre-10am draw, e.g. Free Testosterone. */
  morningRequiredBy?: string | null;
  /** Shown above the grid when rescheduling, so the current booking stays visible. */
  currentSlotLabel?: string | null;
}

export function SlotPicker({
  locationId,
  panelId,
  addOnIds,
  value,
  onChange,
  fastingRequired,
  morningRequiredBy = null,
  currentSlotLabel = null,
}: SlotPickerProps) {
  const earliest = addDays(todayIso(), MIN_LEAD_DAYS);
  const [weekStart, setWeekStart] = useState(value?.date ?? earliest);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(value?.date ?? null);

  // Arrays are new on every render; the joined key is what actually changed.
  const addOnKey = [...addOnIds].sort().join(',');

  useEffect(() => {
    let active = true;
    setAvailability(null);
    setFailed(false);
    bookingService
      .getAvailability({
        locationId,
        panelId,
        addOnIds: addOnKey ? addOnKey.split(',') : [],
        fromDate: weekStart,
        toDate: addDays(weekStart, WINDOW_DAYS - 1),
      })
      .then((res) => {
        if (!active) return;
        setAvailability(res);
        // Land on something bookable rather than on whichever day happens to
        // be first — opening on "closed on Sundays" is a worse first
        // impression than opening on Monday's times.
        setSelectedDate((current) => {
          const stillGood = res.days.some((d) => d.date === current && d.slots.length > 0);
          if (stillGood) return current;
          return res.days.find((d) => d.slots.length > 0)?.date ?? null;
        });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [locationId, panelId, addOnKey, weekStart, retry]);

  // Jumping to a date already on screen only moves the selection; jumping
  // past the window moves the window too. Re-anchoring for a date that is
  // already visible would shuffle the strip under the reader for no reason.
  const jumpTo = useCallback((date: string) => {
    setSelectedDate(date);
    setWeekStart((w) => (date >= w && date <= addDays(w, WINDOW_DAYS - 1) ? w : date));
  }, []);

  const day = availability?.days.find((d) => d.date === selectedDate) ?? null;
  const canGoBack = daysBetween(earliest, weekStart) > 0;
  const windowEnd = addDays(weekStart, WINDOW_DAYS - 1);

  return (
    <div>
      {/* ── week navigation ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() =>
            setWeekStart((w) => (daysBetween(earliest, w) >= WINDOW_DAYS ? addDays(w, -WINDOW_DAYS) : earliest))
          }
          disabled={!canGoBack}
          aria-label="Show the previous week"
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-taupe bg-white px-4 text-sm font-medium text-espresso transition duration-150 ease-out hover:border-bronze disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-taupe"
        >
          <ChevronLeftIcon />
          <span className="hidden sm:inline">Earlier</span>
        </button>
        <p className="tabular min-w-0 text-center text-sm font-medium text-espresso">
          {formatStripDate(weekStart).day} {formatStripDate(weekStart).month} –{' '}
          {formatStripDate(windowEnd).day} {formatStripDate(windowEnd).month}
        </p>
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, WINDOW_DAYS))}
          aria-label="Show the next week"
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-taupe bg-white px-4 text-sm font-medium text-espresso transition duration-150 ease-out hover:border-bronze"
        >
          <span className="hidden sm:inline">Later</span>
          <ChevronRightIcon />
        </button>
      </div>

      {availability === null && !failed && (
        <div className="mt-5 flex gap-2" aria-busy="true" aria-label="Loading available dates">
          {Array.from({ length: WINDOW_DAYS }, (_, i) => (
            <Skeleton key={i} className="h-[92px] flex-1 rounded-input" />
          ))}
        </div>
      )}

      {failed && (
        <div role="alert" className="mt-5 rounded-card border border-status-significantHigh bg-cream-50 p-6">
          <p className="flex items-center gap-2 font-medium text-espresso">
            <AlertIcon className="shrink-0 text-status-significantHigh" />
            We couldn't load the diary
          </p>
          <p className="mt-2 text-sm leading-relaxed text-espresso/90">
            Nothing you've chosen has been lost. Try again — and if it keeps happening, call the clinic and we'll book
            you in over the phone.
          </p>
          <Button variant="secondary" className="mt-5" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}

      {availability && (
        <>
          {/* ── the date strip ────────────────────────────────────────────── */}
          <fieldset className="mt-5">
            <legend className="sr-only">Choose a date</legend>
            <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
              {availability.days.map((d) => (
                <DateChip key={d.date} day={d} checked={d.date === selectedDate} onSelect={() => setSelectedDate(d.date)} />
              ))}
            </div>
          </fieldset>

          {/* A date change swaps the whole grid below with no visible focus
              move — silent to anyone not looking at it. */}
          <p aria-live="polite" className="sr-only">
            {day
              ? day.slots.length > 0
                ? `${day.slots.length} times available on ${formatWeekdayDate(day.date)}`
                : `No times on ${formatWeekdayDate(day.date)}. ${day.closedReason ?? ''}`
              : 'No availability in this week'}
          </p>

          {/* ── the slot grid ─────────────────────────────────────────────── */}
          <div className="mt-8">
            {day && day.slots.length > 0 ? (
              <fieldset>
                <legend className="text-sm font-medium text-espresso">Times on {formatWeekdayDate(day.date)}</legend>
                {currentSlotLabel && (
                  <p className="mt-1.5 text-sm text-espresso/75">Currently booked for {currentSlotLabel}.</p>
                )}
                {(fastingRequired || morningRequiredBy) && (
                  <p className="mt-3 flex items-start gap-2 text-sm text-espresso/85">
                    <ClockIcon className="mt-0.5 shrink-0 text-bronze-700" />
                    <span>
                      {morningRequiredBy
                        ? `${morningRequiredBy} needs a slot before ${MORNING_CUTOFF_HOUR}am. Later times are shown, but can't be booked alongside it.`
                        : 'An overnight fast is far easier to finish than a daytime one — the earliest slots are marked.'}
                    </span>
                  </p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                  {day.slots.map((slot) => (
                    <SlotChip
                      key={slot.id}
                      slot={slot}
                      checked={value?.id === slot.id}
                      blocked={!!morningRequiredBy && Number(slot.time.slice(0, 2)) >= MORNING_CUTOFF_HOUR}
                      earlyHint={fastingRequired && !morningRequiredBy && Number(slot.time.slice(0, 2)) < 9}
                      onSelect={() => onChange(slot)}
                    />
                  ))}
                </div>
                <p className="tabular mt-4 text-xs text-espresso/70">
                  Allow about {day.slots[0].durationMinutes} minutes at the clinic.
                </p>
              </fieldset>
            ) : (
              <NoAvailability
                reason={day?.closedReason ?? 'Every day in this week is either closed or fully booked.'}
                dateLabel={day ? formatWeekdayDate(day.date) : null}
                // A later day in the week that does have slots beats the
                // service's next-available date, which only looks past the
                // window and would send someone further forward than they
                // need to go.
                nextAvailableDate={
                  availability.days.find((d) => (!day || d.date > day.date) && d.slots.length > 0)?.date ??
                  availability.nextAvailableDate
                }
                onJump={jumpTo}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── date chip ──────────────────────────────────────────────────────────── */

function DateChip({ day, checked, onSelect }: { day: DayAvailability; checked: boolean; onSelect: () => void }) {
  const { weekday, day: dayNum, month } = formatStripDate(day.date);
  const count = day.slots.length;
  const unavailable = count === 0;
  const id = `date-${day.date}`;

  return (
    <label
      htmlFor={id}
      className={`relative flex min-w-[62px] flex-1 shrink-0 flex-col items-center gap-0.5 rounded-input px-2 py-3 text-center ${
        unavailable ? 'cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <input
        id={id}
        type="radio"
        name="booking-date"
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        checked={checked}
        disabled={unavailable}
        onChange={onSelect}
      />
      {/* Selection is carried by a 2px bronze border plus a tinted fill plus
          the weight shift on the date below — three cues, none of them colour
          on its own. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-input border border-taupe bg-white transition duration-150 ease-out peer-hover:border-bronze/60 peer-checked:border-2 peer-checked:border-bronze peer-checked:bg-bronze-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bronze peer-disabled:border-taupe peer-disabled:bg-cream-200"
      />
      <span className={`relative text-[11px] font-medium uppercase tracking-eyebrow ${unavailable ? 'text-espresso/50' : 'text-espresso/70'}`}>
        {weekday}
      </span>
      <span
        className={`tabular relative text-xl leading-none ${
          unavailable ? 'text-espresso/50' : checked ? 'font-semibold text-bronze-700' : 'text-espresso'
        }`}
      >
        {dayNum}
      </span>
      <span className={`relative text-[11px] ${unavailable ? 'text-espresso/50' : 'text-espresso/70'}`}>{month}</span>
      {/* The count is the point of the strip — it lets someone skip three
          fully-booked days without opening each one. */}
      <span className={`tabular relative mt-1 text-[11px] font-medium ${unavailable ? 'text-espresso/60' : 'text-espresso/80'}`}>
        {unavailable ? 'None' : `${count} free`}
      </span>
    </label>
  );
}

/* ── slot chip ──────────────────────────────────────────────────────────── */

function SlotChip({
  slot,
  checked,
  blocked,
  earlyHint,
  onSelect,
}: {
  slot: Slot;
  checked: boolean;
  blocked: boolean;
  earlyHint: boolean;
  onSelect: () => void;
}) {
  const id = `slot-${slot.id}`;
  return (
    <label
      htmlFor={id}
      className={`relative flex min-h-[56px] flex-col items-center justify-center rounded-input px-2 py-2.5 ${
        blocked ? 'cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <input
        id={id}
        type="radio"
        name="booking-slot"
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        checked={checked}
        disabled={blocked}
        onChange={onSelect}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-input border border-taupe bg-white transition duration-150 ease-out peer-hover:border-bronze/60 peer-checked:border-2 peer-checked:border-bronze peer-checked:bg-bronze-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bronze peer-disabled:border-taupe peer-disabled:bg-cream-200"
      />
      <span
        className={`tabular relative text-[15px] ${
          blocked ? 'text-espresso/55' : checked ? 'font-semibold text-bronze-700' : 'font-medium text-espresso'
        }`}
      >
        {formatClockTime(slot.time)}
      </span>
      {earlyHint && <span className="relative mt-0.5 text-[11px] leading-none text-espresso/70">easier fast</span>}
      {blocked && <span className="relative mt-0.5 text-[11px] leading-none text-espresso/70">too late</span>}
    </label>
  );
}

/* ── nothing available ──────────────────────────────────────────────────── */

/**
 * The graceful part. An empty diary always says *why* it is empty, in words
 * someone can act on, and offers the next date that isn't — paging forward
 * one blind week at a time is not a recovery.
 */
function NoAvailability({
  reason,
  dateLabel,
  nextAvailableDate,
  onJump,
}: {
  reason: string;
  dateLabel: string | null;
  nextAvailableDate: string | null;
  onJump: (date: string) => void;
}) {
  return (
    <div className="rounded-card border border-taupe bg-cream-100 p-6 text-center sm:p-10">
      <p className="font-display text-2xl leading-tight text-espresso sm:text-3xl">
        {dateLabel ? `Nothing on ${dateLabel}` : 'Nothing available this week'}
      </p>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-espresso/85">{reason}</p>
      {nextAvailableDate ? (
        <Button className="mt-7" onClick={() => onJump(nextAvailableDate)}>
          Jump to {formatWeekdayDate(nextAvailableDate)}
        </Button>
      ) : (
        <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-espresso/85">
          There is nothing bookable at this clinic in the next few months. Try another location, or call us and we'll
          find you something.
        </p>
      )}
    </div>
  );
}
