import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { ArrowRightIcon, PinIcon } from '../../components/nav/patientIcons';
import {
  combinedTurnaround,
  expectedResultsLabel,
  formatClockTime,
  formatWeekdayDate,
  homeKitAddOns,
  relativeDayLabel,
} from '../../lib/booking/prep';
import type { Appointment, AppointmentStatus } from '../../lib/booking/types';
import { FastingNotice } from './FastingNotice';
import { AlertIcon, CalendarIcon, ClockIcon, HomeKitIcon, TickIcon } from './bookingIcons';
import { resolveAppointment, type Catalogue } from './useCatalogue';

/**
 * One appointment, as it appears in a list — the Overview strip and the
 * appointments screen both render this, so an upcoming appointment looks the
 * same wherever a patient meets it.
 *
 * The fasting line is inside the card rather than on the detail page alone.
 * Someone glancing at their Overview two days before a fasted draw needs the
 * instruction there, not one click away.
 */

const STATUS_COPY: Record<AppointmentStatus, { label: string; description: string }> = {
  CONFIRMED: { label: 'Confirmed', description: 'Booked and confirmed' },
  COMPLETED: { label: 'Sample taken', description: 'This appointment has happened' },
  CANCELLED: { label: 'Cancelled', description: 'This appointment was cancelled' },
};

/** Shape first, then the word — the badge survives greyscale on its own. */
export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const copy = STATUS_COPY[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
        status === 'CANCELLED' ? 'border-taupe text-espresso/75' : 'border-bronze/50 bg-bronze-50 text-bronze-700'
      }`}
    >
      {status === 'CANCELLED' ? <AlertIcon className="h-3.5 w-3.5" /> : <TickIcon className="h-3.5 w-3.5" />}
      {copy.label}
    </span>
  );
}

interface AppointmentCardProps {
  appointment: Appointment;
  catalogue: Catalogue | null;
  /** Overview shows a tighter version — no add-on list, no results estimate. */
  compact?: boolean;
}

export function AppointmentCard({ appointment, catalogue, compact = false }: AppointmentCardProps) {
  const { panel, addOns, location } = resolveAppointment(catalogue, appointment);
  const upcoming = appointment.status === 'CONFIRMED';
  const to = `/appointments/${appointment.id}`;

  return (
    <Link to={to} className="block rounded-card">
      <Card interactive={upcoming} inert={appointment.status === 'CANCELLED'} className="flex h-full flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow mb-2">
              {upcoming ? relativeDayLabel(appointment.date) : formatWeekdayDate(appointment.date)}
            </p>
            <p className="font-display text-2xl leading-tight text-espresso sm:text-3xl">
              {panel?.name ?? 'Blood test'}
            </p>
          </div>
          <AppointmentStatusBadge status={appointment.status} />
        </div>

        <dl className="mt-5 flex flex-col gap-2.5 text-sm text-espresso">
          <div className="flex items-start gap-2.5">
            <dt className="sr-only">Date and time</dt>
            <CalendarIcon className="mt-0.5 shrink-0 text-bronze-700" />
            <dd className="tabular">
              {formatWeekdayDate(appointment.date)} at {formatClockTime(appointment.time)}
            </dd>
          </div>
          <div className="flex items-start gap-2.5">
            <dt className="sr-only">Clinic</dt>
            <PinIcon className="mt-0.5 shrink-0 text-bronze-700" />
            <dd>{location?.name ?? 'Clinic'}</dd>
          </div>
          {!compact && (
            <div className="flex items-start gap-2.5">
              <dt className="sr-only">How long to allow</dt>
              <ClockIcon className="mt-0.5 shrink-0 text-bronze-700" />
              <dd className="tabular">About {appointment.durationMinutes} minutes</dd>
            </div>
          )}
        </dl>

        {!compact && addOns.length > 0 && (
          <p className="mt-4 text-sm text-espresso/85">
            With {addOns.map((a) => a.name).join(', ')}.
          </p>
        )}

        {!compact && homeKitAddOns(addOns).length > 0 && (
          <p className="mt-3 flex items-start gap-2 text-sm text-espresso/85">
            <HomeKitIcon className="mt-0.5 shrink-0 text-bronze-700" />
            <span>{homeKitAddOns(addOns).map((a) => a.name).join(', ')} arrives by post. It isn't taken at this appointment.</span>
          </p>
        )}

        {/* Fasting is carried on the card itself, not left to the detail page.
            The instruction has to be where the appointment is. */}
        {upcoming && (
          <FastingNotice
            variant="summary"
            panel={panel}
            addOns={addOns}
            date={appointment.date}
            time={appointment.time}
            className="mt-5"
          />
        )}

        {!compact && appointment.status === 'COMPLETED' && (
          <p className="mt-5 text-sm text-espresso/85">
            {appointment.reportId ? (
              <>Your results from this appointment are in your portal.</>
            ) : (
              <>
                Results usually arrive {combinedTurnaround(panel, addOns).label.toLowerCase()} after the draw,{' '}
                {expectedResultsLabel(panel, addOns, appointment.date)}. Nothing is published until a clinician has
                reviewed it.
              </>
            )}
          </p>
        )}

        <p className="mt-6 flex items-center gap-1.5 text-sm font-medium text-bronze-700">
          {upcoming ? 'Manage this appointment' : 'View appointment'} <ArrowRightIcon />
        </p>
      </Card>
    </Link>
  );
}
