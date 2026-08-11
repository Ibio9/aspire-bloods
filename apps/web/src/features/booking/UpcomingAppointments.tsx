import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { ArrowRightIcon } from '../../components/nav/patientIcons';
import { bookingService } from '../../lib/booking/bookingService';
import type { Appointment } from '../../lib/booking/types';
import { AppointmentCard } from './AppointmentCard';
import { CalendarPlusIcon } from './bookingIcons';
import { useCatalogue } from './useCatalogue';

/**
 * The Overview strip.
 *
 * An appointment two days away is the most time-sensitive thing in the whole
 * portal — it has a preparation deadline attached to it — so it sits above
 * the results, not below them. Results can be read tomorrow; a fast cannot be
 * started retrospectively.
 *
 * With nothing booked, this becomes the prompt to book rather than
 * disappearing. A patient who has just read that a marker needs watching is
 * exactly the person who wants a retest, and making them go looking for the
 * sidebar for it is a lost booking.
 */
export function UpcomingAppointments() {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { catalogue } = useCatalogue();

  useEffect(() => {
    let active = true;
    bookingService
      .listAppointments()
      .then((a) => active && setAppointments(a.filter((x) => x.status === 'CONFIRMED')))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  // The booking flow is reachable from the sidebar regardless, so a failed
  // fetch here degrades to silence rather than to an error on a screen that
  // is mostly about something else.
  if (failed) return null;

  if (appointments === null) {
    return (
      <section aria-busy="true" aria-label="Loading your appointments">
        <Skeleton className="h-8 w-56" />
        <Card className="mt-7">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-44" />
          <Skeleton className="mt-6 h-4 w-56" />
        </Card>
      </section>
    );
  }

  if (appointments.length === 0) {
    return (
      <section aria-labelledby="book-heading">
        <h2 id="book-heading" className="font-display text-2xl text-espresso">
          Nothing booked
        </h2>
        <Card className="mt-7 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-reading leading-relaxed text-espresso">
            When you’re ready for your next panel, you can book it here.
          </p>
          <Link
            to="/book"
            className="inline-flex min-h-tap shrink-0 items-center gap-2 rounded-full bg-bronze bg-btn-primary px-5 py-2.5 font-display text-sm tracking-wide text-onaccent shadow-btn transition duration-150 ease-out hover:bg-bronze-600 hover:shadow-btn-hover motion-safe:hover:-translate-y-px"
          >
            <CalendarPlusIcon className="h-4 w-4" />
            Book a test
          </Link>
        </Card>
      </section>
    );
  }

  return (
    <section aria-labelledby="upcoming-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id="upcoming-heading" className="font-display text-2xl text-espresso">
          {appointments.length === 1 ? 'Your next appointment' : 'Your next appointments'}
        </h2>
        <Link
          to="/appointments"
          className="flex min-h-tap items-center gap-1.5 rounded-full text-sm font-medium text-bronze-700 underline-offset-4 hover:underline"
        >
          All appointments <ArrowRightIcon />
        </Link>
      </div>
      <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {appointments.slice(0, 2).map((a) => (
          <AppointmentCard key={a.id} appointment={a} catalogue={catalogue} compact />
        ))}
      </div>
    </section>
  );
}
