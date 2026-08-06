import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bookingService } from '../../lib/booking/bookingService';
import { formatClockTime, formatWeekdayDate } from '../../lib/booking/prep';
import type { Appointment } from '../../lib/booking/types';
import { CalendarIcon } from './bookingIcons';
import { locationFor, useCatalogue } from './useCatalogue';

/**
 * The link back: which appointment produced this panel.
 *
 * "Where did this sample come from" is a real question a patient asks of a
 * result — particularly when two panels a few months apart were drawn at
 * different clinics, and one reads oddly. Naming the appointment closes that
 * loop with a fact rather than a shrug.
 *
 * Renders nothing when no appointment matches. A report can pre-date the
 * booking system, or come from a sample taken elsewhere entirely, and an
 * empty "booked via" row on those would be noise on a page about results.
 */
export function ReportBookingLink({ reportId }: { reportId: string }) {
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const { catalogue } = useCatalogue();

  useEffect(() => {
    let active = true;
    bookingService
      .findAppointmentForReport(reportId)
      .then((a) => active && setAppointment(a))
      .catch(() => {
        /* the provenance line is a nicety; results are the page */
      });
    return () => {
      active = false;
    };
  }, [reportId]);

  if (!appointment) return null;
  const location = locationFor(catalogue, appointment.locationId);

  return (
    <Link
      to={`/appointments/${appointment.id}`}
      className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-taupe bg-white px-4 py-2 text-sm text-espresso transition duration-150 ease-out hover:border-bronze"
    >
      <CalendarIcon className="shrink-0 text-bronze-700" />
      <span className="tabular">
        From your appointment on {formatWeekdayDate(appointment.date)} at {formatClockTime(appointment.time)}
        {location ? `, ${location.name}` : ''}
      </span>
    </Link>
  );
}
