import { useEffect, useState } from 'react';
import { bookingService } from '../../lib/booking/bookingService';
import type { AddOn, Appointment, BookingLocation, Panel } from '../../lib/booking/types';

/**
 * The catalogue — panels, add-ons and clinics — fetched once per session and
 * shared by every mount. Six screens need it (the five booking steps, the
 * appointments list, the detail page, the Overview strip and the report
 * header), and it changes about as often as the price list does, so one
 * request is the right number.
 *
 * Same module-scoped-promise shape as `lib/patientPortal.ts`'s clinic contact
 * cache, deliberately: a second caching idiom for the same problem is a
 * second thing to reason about.
 */

export interface Catalogue {
  panels: Panel[];
  addOns: AddOn[];
  locations: BookingLocation[];
}

let cataloguePromise: Promise<Catalogue> | null = null;

function loadCatalogue(): Promise<Catalogue> {
  cataloguePromise ??= Promise.all([
    bookingService.listPanels(),
    bookingService.listAddOns(),
    bookingService.listLocations(),
  ])
    .then(([panels, addOns, locations]) => ({ panels, addOns, locations }))
    .catch((e: unknown) => {
      cataloguePromise = null;
      throw e;
    });
  return cataloguePromise;
}

export function useCatalogue(): { catalogue: Catalogue | null; failed: boolean } {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    loadCatalogue()
      .then((c) => active && setCatalogue(c))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  return { catalogue, failed };
}

/* ── lookups ────────────────────────────────────────────────────────────── */

export function panelFor(catalogue: Catalogue | null, id: string | null | undefined): Panel | null {
  return catalogue?.panels.find((p) => p.id === id) ?? null;
}

export function locationFor(catalogue: Catalogue | null, id: string | null | undefined): BookingLocation | null {
  return catalogue?.locations.find((l) => l.id === id) ?? null;
}

/** Kept in catalogue order rather than selection order, so two identical bookings read identically. */
export function addOnsFor(catalogue: Catalogue | null, ids: string[]): AddOn[] {
  return catalogue?.addOns.filter((a) => ids.includes(a.id)) ?? [];
}

/**
 * The catalogue pieces an appointment refers to, resolved in one call —
 * every consumer of an `Appointment` needs all three and none of them needs
 * the ids.
 */
export function resolveAppointment(catalogue: Catalogue | null, appointment: Appointment) {
  return {
    panel: panelFor(catalogue, appointment.panelId),
    addOns: addOnsFor(catalogue, appointment.addOnIds),
    location: locationFor(catalogue, appointment.locationId),
  };
}
