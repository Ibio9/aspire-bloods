import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { useToast } from '../../components/ui/Toast';
import { ClinicContactCard } from '../../components/patient/ClinicContact';
import { bookingService, withinChangeWindow } from '../../lib/booking/bookingService';
import { combineFasting, formatClockTime, formatWeekdayDate, morningOnlyAddOn } from '../../lib/booking/prep';
import type { Appointment, Slot } from '../../lib/booking/types';
import { FastingNotice } from './FastingNotice';
import { SlotPicker } from './SlotPicker';
import { AlertIcon } from './bookingIcons';
import { resolveAppointment, useCatalogue } from './useCatalogue';

/**
 * Moving an appointment is choosing a time again, so it is the same picker —
 * a second, subtly different one would be a second, subtly different set of
 * bugs.
 *
 * The one thing this screen has to add is the fasting deadline for the *new*
 * time, shown before the change is committed. Someone moving an 8am draw to
 * 2pm is moving their last meal by six hours, and that is not obvious from
 * two times side by side.
 */
export function ReschedulePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { show } = useToast();
  const { catalogue } = useCatalogue();

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [failed, setFailed] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function save() {
    if (!appointment || !slot) return;
    setSaving(true);
    setError(null);
    try {
      await bookingService.reschedule(appointment.id, { slotId: slot.id, date: slot.date, time: slot.time });
      show(`Moved to ${formatWeekdayDate(slot.date)} at ${formatClockTime(slot.time)}.`, 'success');
      navigate(`/appointments/${appointment.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not move that appointment.');
      setSlot(null);
      setSaving(false);
    }
  }

  if (failed) {
    return (
      <>
        <Breadcrumbs items={[{ label: 'Appointments', to: '/appointments' }, { label: 'Not found' }]} />
        <TwoTierHeading eyebrow="Aspire Clinic · Patient portal" title="We couldn't find that appointment" />
        <Card className="mt-8 max-w-xl">
          <p className="text-sm leading-relaxed text-espresso/90">
            The link may be out of date. Everything currently in your diary is listed under your appointments.
          </p>
          <Link
            to="/appointments"
            className="mt-6 inline-flex min-h-[44px] items-center rounded-full border border-taupe px-5 py-2.5 text-sm font-medium text-espresso transition duration-150 ease-out hover:border-bronze"
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
        <Skeleton className="mt-10 h-24 w-full rounded-card" />
      </div>
    );
  }

  const { panel, addOns, location } = resolveAppointment(catalogue, appointment);
  const fasting = combineFasting(panel, addOns);

  // Rescheduling is gated on exactly the same rule the service enforces, so
  // the screen never invites a change it is about to refuse.
  if (appointment.status !== 'CONFIRMED' || !withinChangeWindow(appointment)) {
    return (
      <>
        <Breadcrumbs
          items={[
            { label: 'Appointments', to: '/appointments' },
            { label: panel?.name ?? 'Appointment', to: `/appointments/${appointment.id}` },
            { label: 'Move' },
          ]}
        />
        <TwoTierHeading eyebrow="Aspire Clinic · Patient portal" title="This one can't be moved online" />
        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <p className="flex items-center gap-2.5 font-medium text-espresso">
              <AlertIcon className="shrink-0 text-bronze-700" />
              {appointment.status === 'CANCELLED'
                ? 'This appointment was cancelled'
                : appointment.status === 'COMPLETED'
                  ? 'This appointment has already happened'
                  : 'Too close to change online'}
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-espresso/90">
              {appointment.status === 'CONFIRMED'
                ? `Appointments can be moved here up to ${bookingService.changeCutoffHours} hours beforehand, and yours is inside that window. Please call the clinic. We would much rather rearrange it than have you not turn up.`
                : 'Book a new appointment whenever you are ready, or call us if you would rather do it with someone.'}
            </p>
            <Button className="mt-6" variant="secondary" onClick={() => navigate('/book')}>
              Book a new test
            </Button>
          </Card>
          <ClinicContactCard />
        </div>
      </>
    );
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Appointments', to: '/appointments' },
          { label: panel?.name ?? 'Appointment', to: `/appointments/${appointment.id}` },
          { label: 'Move' },
        ]}
      />
      <TwoTierHeading eyebrow={`Reference ${appointment.reference}`} title="Move your appointment" />
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-espresso">
        You're moving your <span className="font-medium">{panel?.name}</span> at {location?.name}. Everything else
        stays as it is, including your reference. Pick a new time and nothing else changes.
      </p>

      {error && (
        <div role="alert" className="mt-8 rounded-card border border-status-significantHigh bg-cream-50 p-5 sm:p-6">
          <p className="flex items-start gap-2.5 text-[15px] leading-relaxed text-espresso">
            <AlertIcon className="mt-0.5 shrink-0 text-status-significantHigh" />
            <span>
              <span className="font-medium">Your original appointment is untouched.</span> {error}
            </span>
          </p>
        </div>
      )}

      <div className="mt-12">
        {location && panel && (
          <SlotPicker
            locationId={location.id}
            panelId={panel.id}
            addOnIds={appointment.addOnIds}
            value={slot}
            onChange={setSlot}
            fastingRequired={fasting.required}
            morningRequiredBy={morningOnlyAddOn(addOns)?.name ?? null}
            currentSlotLabel={`${formatWeekdayDate(appointment.date)} at ${formatClockTime(appointment.time)}`}
          />
        )}
      </div>

      {/* The new fasting deadline, before the change is committed. Moving an
          8am draw to 2pm moves the last meal by six hours; two clock times
          side by side do not say that on their own. */}
      {slot && (
        <div className="mt-12">
          <h2 className="font-display text-3xl text-espresso">What changes</h2>
          <Card className="mt-6">
            <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <dt className="eyebrow mb-1.5">Was</dt>
                <dd className="tabular text-[15px] text-espresso/75 line-through">
                  {formatWeekdayDate(appointment.date)} at {formatClockTime(appointment.time)}
                </dd>
              </div>
              <div>
                <dt className="eyebrow mb-1.5">Now</dt>
                <dd className="tabular text-[15px] font-medium text-espresso">
                  {formatWeekdayDate(slot.date)} at {formatClockTime(slot.time)}
                </dd>
              </div>
            </dl>
          </Card>
          <FastingNotice
            panel={panel}
            addOns={addOns}
            date={slot.date}
            time={slot.time}
            className="mt-6"
          />
        </div>
      )}

      <div className="sticky bottom-4 z-20 mt-12 flex items-center justify-between gap-3 rounded-full border border-taupe bg-cream-50/95 p-2 shadow-card backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        <Button variant="ghost" onClick={() => navigate(`/appointments/${appointment.id}`)} className="shrink-0">
          Keep the original
        </Button>
        <Button
          onClick={() => void save()}
          loading={saving}
          disabled={!slot}
          disabledReason="Choose a new time first"
          className="shrink-0"
        >
          Move my appointment
        </Button>
      </div>
    </>
  );
}
