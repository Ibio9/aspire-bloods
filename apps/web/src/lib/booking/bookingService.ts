/* ═══════════════════════════════════════════════════════════════════════════
   ⚠  MOCK SERVICE — THIS IS THE ONE FILE THE RANDOX INTEGRATION REPLACES.  ⚠
   ═══════════════════════════════════════════════════════════════════════════

   Randox will supply the real availability and booking API. Until it exists,
   this file stands in for it: synthetic slots, an in-browser appointment
   store, and simulated network latency so every loading, empty and error
   state in the UI is exercised for real rather than assumed.

   Nothing in `features/booking` imports anything from this file except the
   exported `bookingService` const at the bottom. Every type it traffics in
   lives in `./types`, every piece of Aspire's own content lives in
   `./catalogue`, and every derivation lives in `./prep` — all three survive
   the swap untouched.

   To go live: rewrite the body of this file against the Randox endpoints,
   keeping the same export name, the same path, and the same
   `BookingService` shape. No component changes. `./README.md` documents
   exactly what the real API has to provide, field by field.

   Nothing here is persisted server-side, nothing here is real, and no
   appointment made through it exists anywhere but this browser.
   ═══════════════════════════════════════════════════════════════════════════ */

import { ADD_ONS, LOCATIONS, PANELS } from './catalogue';
import { addDays, todayIso, slotDateTime } from './prep';
import {
  BookingError,
  type AddOn,
  type Appointment,
  type AvailabilityQuery,
  type AvailabilityResponse,
  type BookingLocation,
  type BookingRequest,
  type BookingService,
  type DayAvailability,
  type Panel,
  type Slot,
} from './types';

/** How much notice the clinic needs before the first bookable slot. */
const MIN_LEAD_DAYS = 2;

/** Online reschedule/cancel closes this many hours before the appointment. */
const CHANGE_CUTOFF_HOURS = 24;

/** How far ahead `nextAvailableDate` will search before giving up. */
const FORWARD_SEARCH_DAYS = 120;

const STORAGE_KEY = 'aspire_booking_mock_v1';

/* ── simulated network ──────────────────────────────────────────────────── */

/** Enough delay that skeletons and disabled buttons are genuinely visible. */
function latency<T>(value: T, ms = 320): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function fail(message: string, code: BookingError['code'], ms = 320): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new BookingError(message, code)), ms));
}

/* ── deterministic pseudo-randomness ────────────────────────────────────── */

/**
 * Availability has to be stable: the same day must show the same slots on a
 * re-render, on a back-navigation, and after a reschedule is abandoned. A
 * hash of the inputs gives that for free, where `Math.random()` would make
 * the calendar flicker.
 */
function hash(...parts: string[]): number {
  let h = 2166136261;
  const input = parts.join('|');
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/* ── opening hours ──────────────────────────────────────────────────────── */

interface OpeningWindow {
  /** Minutes past midnight of the first and last bookable start times. */
  first: number;
  last: number;
  stepMinutes: number;
}

/** Null means closed that day, with the reason the UI shows in its place. */
function openingFor(location: BookingLocation, date: string): { window: OpeningWindow | null; closedReason: string | null } {
  const day = slotDateTime(date, '12:00').getDay();

  if (location.kind === 'ASPIRE_CLINIC') {
    if (day === 0) {
      return { window: null, closedReason: 'Closed on Sundays — Mortimer Street is weekdays and Saturday mornings.' };
    }
    if (day === 6) {
      return { window: { first: 8 * 60, last: 11 * 60 + 30, stepMinutes: 30 }, closedReason: null };
    }
    return { window: { first: 7 * 60 + 30, last: 17 * 60, stepMinutes: 30 }, closedReason: null };
  }

  // Randox clinics run seven days, with a shorter Sunday.
  if (day === 0) {
    return { window: { first: 9 * 60, last: 14 * 60 + 40, stepMinutes: 20 }, closedReason: null };
  }
  return { window: { first: 7 * 60, last: 18 * 60 + 40, stepMinutes: 20 }, closedReason: null };
}

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/* ── the appointment store ──────────────────────────────────────────────── */

/**
 * A browser-local stand-in for the Randox booking record. Reads are tolerant
 * of anything unparseable — a corrupted key should degrade to "no
 * appointments", never to a page that will not render.
 */
function readStore(): Appointment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedStore();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Appointment[]) : [];
  } catch {
    return [];
  }
}

function writeStore(appointments: Appointment[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appointments));
  } catch {
    /* a locked-down browser losing mock state is not worth a broken render */
  }
}

function reference(seed: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let n = hash(seed);
  let out = '';
  for (let i = 0; i < 5; i += 1) {
    out += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length) + 7;
  }
  return `ASB-${out}`;
}

/** Nearest weekday at or after an ISO date — seeded fixtures must land on an open day. */
function nextWeekday(iso: string): string {
  let cursor = iso;
  for (let i = 0; i < 7; i += 1) {
    const day = slotDateTime(cursor, '12:00').getDay();
    if (day !== 0 && day !== 6) return cursor;
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

/**
 * Two fixtures, so the portal has something to show before anyone books:
 * one appointment already in the diary (which is what the Overview screen and
 * the fasting notice are built around) and one that has already happened,
 * which is what the results→booking link hangs off.
 */
function seedStore(): Appointment[] {
  const today = todayIso();
  const upcoming = nextWeekday(addDays(today, 9));
  const past = nextWeekday(addDays(today, -74));

  const seeded: Appointment[] = [
    {
      id: 'apt-seed-upcoming',
      reference: reference('apt-seed-upcoming'),
      status: 'CONFIRMED',
      panelId: 'signature',
      addOnIds: [],
      locationId: 'aspire-mortimer-street',
      date: upcoming,
      time: '08:00',
      durationMinutes: 15,
      createdAt: new Date().toISOString(),
      cancelledAt: null,
      reportId: null,
    },
    {
      id: 'apt-seed-past',
      reference: reference('apt-seed-past'),
      status: 'COMPLETED',
      panelId: 'insight-360',
      addOnIds: ['omega-3-index'],
      locationId: 'aspire-mortimer-street',
      date: past,
      time: '07:30',
      durationMinutes: 20,
      createdAt: new Date(Date.now() - 90 * 86_400_000).toISOString(),
      cancelledAt: null,
      reportId: null,
    },
  ];
  writeStore(seeded);
  return seeded;
}

/** Anything in the past that was never cancelled has, by definition, happened. */
function withDerivedStatus(a: Appointment): Appointment {
  if (a.status === 'CANCELLED') return a;
  const past = slotDateTime(a.date, a.time).getTime() < Date.now();
  return past ? { ...a, status: 'COMPLETED' } : { ...a, status: 'CONFIRMED' };
}

function activeAt(appointments: Appointment[], locationId: string, date: string, time: string): boolean {
  return appointments.some(
    (a) => a.status !== 'CANCELLED' && a.locationId === locationId && a.date === date && a.time === time,
  );
}

/* ── availability ───────────────────────────────────────────────────────── */

function buildDay(location: BookingLocation, date: string, durationMinutes: number, booked: Appointment[]): DayAvailability {
  const earliest = addDays(todayIso(), MIN_LEAD_DAYS);
  if (date < earliest) {
    return {
      date,
      slots: [],
      closedReason: `Too soon — we need ${MIN_LEAD_DAYS} days’ notice so your paperwork and any kits are ready.`,
    };
  }

  const { window, closedReason } = openingFor(location, date);
  if (!window) return { date, slots: [], closedReason };

  // A whole-day closure roughly one day in eleven, standing in for the
  // holidays and staff-training days a real diary has in it.
  if (hash(location.id, date, 'closure') % 11 === 0) {
    return { date, slots: [], closedReason: 'Fully booked — every slot on this day has gone.' };
  }

  const slots: Slot[] = [];
  for (let m = window.first; m <= window.last; m += window.stepMinutes) {
    const time = minutesToTime(m);
    // ~60% of the diary is already taken, which is what makes the picker feel
    // like a real one rather than an empty grid.
    if (hash(location.id, date, time) % 100 < 60) continue;
    if (activeAt(booked, location.id, date, time)) continue;
    slots.push({ id: `${location.id}:${date}:${time}`, date, time, durationMinutes });
  }

  return {
    date,
    slots,
    closedReason: slots.length === 0 ? 'Fully booked — every slot on this day has gone.' : null,
  };
}

function findNextAvailable(location: BookingLocation, after: string, durationMinutes: number, booked: Appointment[]): string | null {
  let cursor = after;
  for (let i = 0; i < FORWARD_SEARCH_DAYS; i += 1) {
    cursor = addDays(cursor, 1);
    if (buildDay(location, cursor, durationMinutes, booked).slots.length > 0) return cursor;
  }
  return null;
}

function durationFor(panelId: string, addOnIds: string[]): number {
  const panel = PANELS.find((p) => p.id === panelId);
  const base = panel?.appointmentMinutes ?? 15;
  // Every extra vial adds a little chair time, except the home kit, which
  // adds none because it is not taken at the appointment at all.
  const extraDraws = addOnIds.filter((id) => ADD_ONS.find((a) => a.id === id)?.sampleType === 'SAME_DRAW').length;
  return base + extraDraws * 5;
}

/* ── the service ────────────────────────────────────────────────────────── */

export const bookingService: BookingService = {
  changeCutoffHours: CHANGE_CUTOFF_HOURS,

  listPanels(): Promise<Panel[]> {
    return latency(PANELS, 180);
  },

  listAddOns(): Promise<AddOn[]> {
    return latency(ADD_ONS, 180);
  },

  listLocations(): Promise<BookingLocation[]> {
    return latency(LOCATIONS, 180);
  },

  getAvailability(query: AvailabilityQuery): Promise<AvailabilityResponse> {
    const location = LOCATIONS.find((l) => l.id === query.locationId);
    if (!location) return fail('That clinic is no longer available.', 'NOT_FOUND');

    const booked = readStore().map(withDerivedStatus);
    const duration = durationFor(query.panelId, query.addOnIds);

    const days: DayAvailability[] = [];
    for (let cursor = query.fromDate; cursor <= query.toDate; cursor = addDays(cursor, 1)) {
      days.push(buildDay(location, cursor, duration, booked));
    }

    const hasAny = days.some((d) => d.slots.length > 0);
    return latency({
      days,
      nextAvailableDate: hasAny ? null : findNextAvailable(location, query.toDate, duration, booked),
    });
  },

  book(request: BookingRequest): Promise<Appointment> {
    const location = LOCATIONS.find((l) => l.id === request.locationId);
    if (!location) return fail('That clinic is no longer available.', 'NOT_FOUND');

    const store = readStore().map(withDerivedStatus);
    const duration = durationFor(request.panelId, request.addOnIds);
    const day = buildDay(location, request.date, duration, store);
    if (!day.slots.some((s) => s.id === request.slotId)) {
      return fail(
        'That time has just been taken. Choose another and nothing else you have entered will be lost.',
        'SLOT_TAKEN',
      );
    }

    const id = `apt-${Date.now().toString(36)}-${hash(request.slotId).toString(36).slice(0, 4)}`;
    const appointment: Appointment = {
      id,
      reference: reference(id),
      status: 'CONFIRMED',
      panelId: request.panelId,
      // Add-ons the chosen clinic cannot draw are still ordered — the kit is
      // posted instead — so they stay on the appointment rather than being
      // silently dropped at the point of booking.
      addOnIds: request.addOnIds,
      locationId: request.locationId,
      date: request.date,
      time: request.time,
      durationMinutes: duration,
      createdAt: new Date().toISOString(),
      cancelledAt: null,
      reportId: null,
    };

    writeStore([...store, appointment]);
    return latency(appointment, 700);
  },

  listAppointments(): Promise<Appointment[]> {
    const all = readStore()
      .map(withDerivedStatus)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    return latency(all, 240);
  },

  getAppointment(id: string): Promise<Appointment | null> {
    return latency(readStore().map(withDerivedStatus).find((a) => a.id === id) ?? null, 240);
  },

  reschedule(id: string, slot: { slotId: string; date: string; time: string }): Promise<Appointment> {
    const store = readStore().map(withDerivedStatus);
    const existing = store.find((a) => a.id === id);
    if (!existing) return fail('We could not find that appointment.', 'NOT_FOUND');
    if (existing.status === 'CANCELLED') return fail('That appointment has already been cancelled.', 'ALREADY_CANCELLED');
    if (!withinChangeWindow(existing)) return fail(tooLateMessage(), 'TOO_LATE_TO_CHANGE');

    const location = LOCATIONS.find((l) => l.id === existing.locationId);
    if (!location) return fail('That clinic is no longer available.', 'NOT_FOUND');

    // The appointment being moved must not block its own new slot, so it is
    // excluded from the availability the new slot is validated against.
    const others = store.filter((a) => a.id !== id);
    const day = buildDay(location, slot.date, existing.durationMinutes, others);
    if (!day.slots.some((s) => s.id === slot.slotId)) {
      return fail('That time has just been taken. Choose another.', 'SLOT_TAKEN');
    }

    const updated: Appointment = { ...existing, date: slot.date, time: slot.time, status: 'CONFIRMED' };
    writeStore(store.map((a) => (a.id === id ? updated : a)));
    return latency(updated, 600);
  },

  cancel(id: string): Promise<Appointment> {
    const store = readStore().map(withDerivedStatus);
    const existing = store.find((a) => a.id === id);
    if (!existing) return fail('We could not find that appointment.', 'NOT_FOUND');
    if (existing.status === 'CANCELLED') return fail('That appointment has already been cancelled.', 'ALREADY_CANCELLED');
    if (!withinChangeWindow(existing)) return fail(tooLateMessage(), 'TOO_LATE_TO_CHANGE');

    // Cancelled, never deleted — the record stays, per the no-hard-deletes rule.
    const updated: Appointment = { ...existing, status: 'CANCELLED', cancelledAt: new Date().toISOString() };
    writeStore(store.map((a) => (a.id === id ? updated : a)));
    return latency(updated, 600);
  },

  findAppointmentForReport(reportId: string): Promise<Appointment | null> {
    const store = readStore().map(withDerivedStatus);
    const matched = store.find((a) => a.reportId === reportId);
    if (matched) return latency(matched, 160);

    // MOCK ONLY. The real API knows which appointment produced which report
    // because Randox returns the booking reference alongside the result. With
    // no such link available yet, the seeded past appointment adopts the first
    // released report the portal asks about, so the results→booking link is
    // demonstrable end to end before the integration exists. Delete this
    // block outright when the real service lands.
    const orphan = store.find((a) => a.status === 'COMPLETED' && a.reportId === null);
    if (!orphan) return latency(null, 160);
    const adopted: Appointment = { ...orphan, reportId };
    writeStore(store.map((a) => (a.id === orphan.id ? adopted : a)));
    return latency(adopted, 160);
  },
};

/* ── change window ──────────────────────────────────────────────────────── */

export function withinChangeWindow(appointment: Appointment): boolean {
  const start = slotDateTime(appointment.date, appointment.time).getTime();
  return start - Date.now() > CHANGE_CUTOFF_HOURS * 3_600_000;
}

function tooLateMessage(): string {
  return `Appointments can only be changed online up to ${CHANGE_CUTOFF_HOURS} hours beforehand. Call the clinic and we will sort it out with you.`;
}

/** Exposed for tests and for the "reset the demo" affordance in dev. */
export function __resetMockBookings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}
