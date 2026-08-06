import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { bookingService } from '../../lib/booking/bookingService';
import type { Appointment } from '../../lib/booking/types';
import { AppointmentCard } from './AppointmentCard';
import { CalendarPlusIcon } from './bookingIcons';
import { useCatalogue } from './useCatalogue';

/**
 * Every appointment a patient has, in the order they will look for them:
 * what's coming, what's happened, and — last, and still present — what was
 * cancelled. Nothing is ever removed from this list; a cancelled appointment
 * stays as a record, same as every other object in the product.
 */
export function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { catalogue } = useCatalogue();

  useEffect(() => {
    let active = true;
    bookingService
      .listAppointments()
      .then((a) => active && setAppointments(a))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  const upcoming = appointments?.filter((a) => a.status === 'CONFIRMED') ?? [];
  // Newest first once they're behind you — the last sample taken is the one
  // whose results you're waiting on.
  const past = (appointments?.filter((a) => a.status === 'COMPLETED') ?? []).slice().reverse();
  const cancelled = (appointments?.filter((a) => a.status === 'CANCELLED') ?? []).slice().reverse();

  return (
    <>
      <Breadcrumbs items={[{ label: 'Overview', to: '/overview' }, { label: 'Appointments' }]} />
      <TwoTierHeading eyebrow="Aspire Clinic · Patient portal" title="Your appointments" />
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-espresso">
        Everything in your diary, and everything already behind you. Open any appointment to see what to do
        beforehand, or to move or cancel it.
      </p>

      <div className="mt-8">
        <BookLink />
      </div>

      {failed && (
        <Card className="mt-12 max-w-xl">
          <p className="font-display text-2xl text-espresso">We couldn't load your appointments</p>
          <p className="mt-2 text-sm leading-relaxed text-espresso/80">
            Please refresh the page. If it keeps happening, call the clinic. We can always tell you what's in the
            diary.
          </p>
        </Card>
      )}

      {appointments === null && !failed && (
        <div className="mt-14 grid grid-cols-1 gap-7 lg:grid-cols-2" aria-busy="true" aria-label="Loading your appointments">
          {[0, 1].map((i) => (
            <Card key={i}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-8 w-48" />
              <Skeleton className="mt-6 h-4 w-56" />
              <Skeleton className="mt-3 h-4 w-40" />
            </Card>
          ))}
        </div>
      )}

      {appointments && appointments.length === 0 && (
        <div className="mt-14 max-w-2xl">
          <EmptyState
            title="Nothing booked yet"
            description="When you book a blood test it will appear here, with everything you need to do beforehand and a way to move or cancel it."
            action={
              <Link
                to="/book"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-bronze px-5 py-2.5 text-sm font-medium text-white transition duration-150 ease-out hover:bg-bronze-600"
              >
                <CalendarPlusIcon className="h-4 w-4" />
                Book a test
              </Link>
            }
          />
        </div>
      )}

      {appointments && appointments.length > 0 && (
        <div className="mt-14 flex flex-col gap-14">
          <Group
            heading="Coming up"
            empty="Nothing in the diary at the moment."
            items={upcoming}
            catalogue={catalogue}
          />
          {past.length > 0 && <Group heading="Already done" items={past} catalogue={catalogue} />}
          {cancelled.length > 0 && <Group heading="Cancelled" items={cancelled} catalogue={catalogue} />}
        </div>
      )}
    </>
  );
}

function Group({
  heading,
  items,
  catalogue,
  empty,
}: {
  heading: string;
  items: Appointment[];
  catalogue: ReturnType<typeof useCatalogue>['catalogue'];
  empty?: string;
}) {
  const id = `group-${heading.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="font-display text-3xl text-espresso">
        {heading}
      </h2>
      {items.length === 0 ? (
        empty ? (
          <p className="mt-4 text-[15px] leading-relaxed text-espresso/85">{empty}</p>
        ) : null
      ) : (
        <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-2">
          {items.map((a) => (
            <AppointmentCard key={a.id} appointment={a} catalogue={catalogue} />
          ))}
        </div>
      )}
    </section>
  );
}

function BookLink() {
  return (
    <Link
      to="/book"
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-bronze bg-btn-primary px-5 py-2.5 font-display text-sm tracking-wide text-white shadow-btn transition duration-150 ease-out hover:bg-bronze-600 hover:shadow-btn-hover motion-safe:hover:-translate-y-px"
    >
      <CalendarPlusIcon className="h-4 w-4" />
      Book a test
    </Link>
  );
}
