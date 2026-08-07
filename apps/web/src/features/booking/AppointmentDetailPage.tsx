import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { Skeleton } from '../../components/ui/Skeleton';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { useToast } from '../../components/ui/Toast';
import { ClinicContactCard } from '../../components/patient/ClinicContact';
import { ArrowRightIcon } from '../../components/nav/patientIcons';
import { bookingService, withinChangeWindow } from '../../lib/booking/bookingService';
import {
  combinedTurnaround,
  expectedResultsLabel,
  formatClockTime,
  formatWeekdayDate,
  relativeDayLabel,
} from '../../lib/booking/prep';
import type { Appointment } from '../../lib/booking/types';
import { AppointmentStatusBadge } from './AppointmentCard';
import { BookingSummary } from './BookingSummary';
import { AlertIcon, TickIcon } from './bookingIcons';
import { resolveAppointment, useCatalogue } from './useCatalogue';

/**
 * One appointment in full — and the confirmation screen, which is the same
 * screen arriving with `?booked=1`.
 *
 * Deliberately not two pages. A confirmation that shows a different summary
 * from the one you can come back to a week later is two chances to be wrong
 * about the same appointment, and the second view is the one people actually
 * rely on the night before.
 */
export function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { show } = useToast();
  const { catalogue } = useCatalogue();

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const justBooked = params.get('booked') === '1';

  useEffect(() => {
    if (!id) return;
    let active = true;
    bookingService
      .getAppointment(id)
      .then((a) => {
        if (!active) return;
        if (a) setAppointment(a);
        else setFailed(true);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [id]);

  async function handleCancel() {
    if (!appointment) return;
    const updated = await bookingService.cancel(appointment.id);
    setAppointment(updated);
    setConfirmingCancel(false);
    // Drop the confirmation banner — "Booked" above a cancelled appointment
    // is the kind of contradiction that makes people call the clinic.
    if (justBooked) setParams({}, { replace: true });
    show('Your appointment has been cancelled.', 'success');
  }

  if (failed) {
    return (
      <>
        <Breadcrumbs items={[{ label: 'Overview', to: '/overview' }, { label: 'Appointments', to: '/appointments' }, { label: 'Not found' }]} />
        <TwoTierHeading eyebrow="Aspire Clinic · Patient portal" title="We couldn't find that appointment" />
        <Card className="mt-10 max-w-xl">
          <p className="text-sm leading-relaxed text-espresso/90">
            The link may be out of date. Everything currently in your diary is listed under your appointments.
          </p>
          <Link
            to="/appointments"
            className="mt-6 inline-flex min-h-tap items-center rounded-full border border-taupe px-5 py-2.5 text-sm font-medium text-espresso transition duration-150 ease-out hover:border-bronze"
          >
            Back to my appointments
          </Link>
        </Card>
      </>
    );
  }

  if (!appointment || !catalogue) {
    return (
      <div aria-busy="true" aria-label="Loading your appointment">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-12 w-72" />
        <Card className="mt-10">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-8 w-56" />
          <Skeleton className="mt-8 h-4 w-40" />
          <Skeleton className="mt-3 h-4 w-64" />
        </Card>
      </div>
    );
  }

  const { panel, addOns, location } = resolveAppointment(catalogue, appointment);
  const changeable = appointment.status === 'CONFIRMED' && withinChangeWindow(appointment);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Overview', to: '/overview' },
          { label: 'Appointments', to: '/appointments' },
          { label: `${panel?.name ?? 'Appointment'}, ${formatWeekdayDate(appointment.date)}` },
        ]}
      />

      {/* ── just booked ─────────────────────────────────────────────────── */}
      {justBooked && appointment.status === 'CONFIRMED' && (
        <div role="status" className="mb-8 rounded-card border border-bronze/50 bg-bronze-50 p-6 sm:p-8">
          <p className="flex items-center gap-3 font-display text-2xl leading-tight text-espresso sm:text-3xl">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bronze text-white">
              <TickIcon />
            </span>
            You're booked in
          </p>
          <p className="mt-4 text-reading leading-relaxed text-espresso">
            We've emailed you a confirmation. Your reference is{' '}
            <span className="tabular font-semibold">{appointment.reference}</span>. Quote it if you call us. Read the
            preparation below before the day; it's the part that matters.
          </p>
        </div>
      )}

      <p className="eyebrow mb-3">
        {appointment.status === 'CONFIRMED' ? relativeDayLabel(appointment.date) : 'Appointment'}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="display-heading">{panel?.name ?? 'Blood test'}</h1>
        <AppointmentStatusBadge status={appointment.status} />
      </div>
      <p className="tabular mt-5 text-lg leading-relaxed text-espresso">
        {formatWeekdayDate(appointment.date)} at {formatClockTime(appointment.time)} · reference{' '}
        <span className="font-medium">{appointment.reference}</span>
      </p>

      {/* ── cancelled ───────────────────────────────────────────────────── */}
      {appointment.status === 'CANCELLED' && (
        <div className="mt-8 rounded-card border border-taupe bg-cream-100 p-6 sm:p-8">
          <p className="flex items-center gap-2.5 font-medium text-espresso">
            <AlertIcon className="shrink-0 text-espresso/75" />
            This appointment was cancelled
          </p>
          <p className="mt-3 text-reading leading-relaxed text-espresso/90">
            Nothing was taken and nothing is owed. The record stays here so your history is complete. Book again
            whenever you're ready.
          </p>
          <Button className="mt-6" onClick={() => navigate('/book')}>
            Book another test
          </Button>
        </div>
      )}

      {/* ── the summary ─────────────────────────────────────────────────── */}
      {panel && location && (
        <Card padding="roomy" className="mt-10">
          <BookingSummary
            panel={panel}
            addOns={addOns}
            location={location}
            date={appointment.date}
            time={appointment.time}
            durationMinutes={appointment.durationMinutes}
          />
        </Card>
      )}

      {/* ── results, once they exist ────────────────────────────────────── */}
      {appointment.status === 'COMPLETED' && (
        <section aria-labelledby="results-heading" className="mt-12">
          <h2 id="results-heading" className="font-display text-3xl text-espresso">
            Your results
          </h2>
          {appointment.reportId ? (
            <Link to={`/reports/${appointment.reportId}`} className="mt-6 block rounded-card">
              <Card interactive>
                <p className="font-display text-2xl leading-tight text-espresso">{panel?.name ?? 'Your panel'}</p>
                <p className="mt-3 text-reading leading-relaxed text-espresso/90">
                  The panel from this appointment has been reviewed and released to you.
                </p>
                <p className="mt-5 flex items-center gap-1.5 text-sm font-medium text-bronze-700">
                  Open the full panel <ArrowRightIcon />
                </p>
              </Card>
            </Link>
          ) : (
            <Card className="mt-6">
              <p className="text-reading leading-relaxed text-espresso/90">
                Your sample is with the laboratory. Results for {panel?.name ?? 'this panel'} usually take{' '}
                {combinedTurnaround(panel, addOns).label}, {expectedResultsLabel(panel, addOns, appointment.date)}.
                They come back to the Aspire clinical team first, and nothing is published to you until a clinician
                has reviewed it.
              </p>
            </Card>
          )}
        </section>
      )}

      {/* ── managing it ─────────────────────────────────────────────────── */}
      {appointment.status === 'CONFIRMED' && (
        <section aria-labelledby="manage-heading" className="mt-12">
          <h2 id="manage-heading" className="font-display text-3xl text-espresso">
            Need to change it?
          </h2>

          {changeable ? (
            <>
              <p className="mt-4 max-w-2xl text-reading leading-relaxed text-espresso/90">
                You can move or cancel this appointment yourself up to {bookingService.changeCutoffHours} hours
                beforehand. After that, give us a call and we'll sort it out with you.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button onClick={() => navigate(`/appointments/${appointment.id}/reschedule`)}>
                  Move to another time
                </Button>
                <Button variant="destructive" onClick={() => setConfirmingCancel(true)}>
                  Cancel this appointment
                </Button>
              </div>
            </>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <p className="flex items-center gap-2.5 font-medium text-espresso">
                  <AlertIcon className="shrink-0 text-bronze-700" />
                  Too close to change online
                </p>
                <p className="mt-3 text-reading leading-relaxed text-espresso/90">
                  Appointments can be moved or cancelled here up to {bookingService.changeCutoffHours} hours
                  beforehand, and yours is inside that window. Please call the clinic. We would much rather rearrange
                  it than have you not turn up.
                </p>
              </Card>
              <ClinicContactCard />
            </div>
          )}
        </section>
      )}

      <ConfirmModal
        open={confirmingCancel}
        onClose={() => setConfirmingCancel(false)}
        onConfirm={handleCancel}
        title="Cancel this appointment?"
        confirmLabel="Yes, cancel it"
        confirmingLabel="Cancelling…"
      >
        <p className="leading-relaxed">
          This cancels your <span className="font-medium">{panel?.name ?? 'appointment'}</span> on{' '}
          <span className="tabular font-medium">
            {formatWeekdayDate(appointment.date)} at {formatClockTime(appointment.time)}
          </span>{' '}
          at {location?.name}. The slot goes back into the diary straight away, so it may not still be there if you
          change your mind.
        </p>
        <p className="mt-3 leading-relaxed">
          If you only need a different time, move it instead. That keeps your reference and your place.
        </p>
      </ConfirmModal>
    </>
  );
}
