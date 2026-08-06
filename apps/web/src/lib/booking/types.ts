/**
 * The booking contract.
 *
 * Everything the booking UI knows about panels, clinics, availability and
 * appointments is described here, and nothing in `features/booking` imports
 * anything else from the booking layer except `bookingService` (the single
 * implementation file) and the pure helpers in `prep.ts`.
 *
 * Randox will supply the real availability/booking API later. When it lands,
 * `bookingService.ts` is rewritten against it and this file does not move —
 * which is the whole point of the split. See `README.md` in this folder for
 * the endpoint-by-endpoint contract the real API has to satisfy.
 */

/* ────────────────────────────────────────────────────────────────────────
   Catalogue
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Fasting is the single most consequential piece of preparation in the whole
 * flow — a patient who eats breakfast before a lipid panel has wasted their
 * appointment, the practice's phlebotomy slot and the sample itself. It is
 * therefore a structured rule, not a sentence of prose, so the UI can compute
 * an actual "stop eating at HH:MM on <date>" from the slot the patient picked
 * rather than making them do arithmetic at 11pm.
 */
export interface FastingRule {
  required: boolean;
  /** Minimum hours without food before the draw. 0 when not required. */
  minHours: number;
  /** The upper end of the window — fasting for longer than this skews results too. */
  maxHours: number;
  /** One line, patient-facing, used when there is no slot to compute against yet. */
  summary: string;
}

/** Preparation that isn't fasting: morning-only draws, cycle timing, supplement washout. */
export interface TimingNote {
  /** Short label, e.g. "Morning sample". Carries the meaning on its own in a list. */
  label: string;
  detail: string;
  /**
   * True when getting this wrong makes the result uninterpretable rather than
   * merely less ideal — those are pulled up next to the fasting rule.
   */
  critical: boolean;
}

export interface Panel {
  id: string;
  name: string;
  strapline: string;
  /** The body systems covered, as a patient would name them. */
  covers: string[];
  markerCount: number;
  /** Set where the count genuinely varies, e.g. sex-specific hormone markers. */
  markerCountNote?: string;
  /** Patient-facing turnaround, e.g. "5–7 working days". */
  turnaround: string;
  /** Same figure, machine-readable, so add-on delays can be added to it. */
  turnaroundDays: [number, number];
  fasting: FastingRule;
  timingNotes: TimingNote[];
  /** How long to allow at the clinic, including the paperwork either side of the draw. */
  appointmentMinutes: number;
}

/** How the sample is taken — the practical difference a patient has to plan around. */
export type SampleType =
  /** Taken from the same venous draw as the panel. Nothing extra to do. */
  | 'SAME_DRAW'
  /** A kit is posted out and collected at home, separately from the appointment. */
  | 'HOME_KIT';

export interface AddOn {
  id: string;
  name: string;
  strapline: string;
  detail: string;
  sampleType: SampleType;
  fasting: FastingRule;
  timingNotes: TimingNote[];
  /** Added to the panel's turnaround when this add-on is selected. */
  addsTurnaroundDays: number;
}

export type LocationKind = 'ASPIRE_CLINIC' | 'RANDOX_CLINIC';

export interface BookingLocation {
  id: string;
  kind: LocationKind;
  name: string;
  addressLines: string[];
  /** Nearest station / parking — the thing someone actually needs to get there. */
  travelNote: string;
  openingSummary: string;
  /**
   * The practical differences between the two kinds of location, as
   * label/value pairs so the two can be laid out against each other and
   * compared line for line rather than as two blocks of prose.
   */
  facts: { label: string; value: string }[];
  /** Add-ons this location cannot take a sample for, by id. */
  unavailableAddOnIds: string[];
}

/* ────────────────────────────────────────────────────────────────────────
   Availability
   ──────────────────────────────────────────────────────────────────────── */

export interface Slot {
  /** Opaque to the UI — round-tripped to the service exactly as received. */
  id: string;
  /** `YYYY-MM-DD`, clinic-local. */
  date: string;
  /** `HH:MM`, 24-hour, clinic-local. */
  time: string;
  durationMinutes: number;
}

export interface DayAvailability {
  date: string;
  slots: Slot[];
  /**
   * Why there is nothing on this day, in words a patient can act on ("Closed
   * on Sundays", "Fully booked"). Null when the day has slots. An empty day
   * with no reason is the one thing this UI must never render.
   */
  closedReason: string | null;
}

export interface AvailabilityQuery {
  locationId: string;
  panelId: string;
  addOnIds: string[];
  /** Inclusive `YYYY-MM-DD` range. */
  fromDate: string;
  toDate: string;
}

export interface AvailabilityResponse {
  days: DayAvailability[];
  /**
   * The first bookable date after the requested window, when the window
   * itself is empty. Lets the UI offer "jump to 19 August" instead of asking
   * someone to page forward blindly.
   */
  nextAvailableDate: string | null;
}

/* ────────────────────────────────────────────────────────────────────────
   Appointments
   ──────────────────────────────────────────────────────────────────────── */

export type AppointmentStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export interface Appointment {
  id: string;
  /** Human-quotable on the phone, e.g. "ASB-7K2QD". */
  reference: string;
  status: AppointmentStatus;
  panelId: string;
  addOnIds: string[];
  locationId: string;
  date: string;
  time: string;
  durationMinutes: number;
  createdAt: string;
  cancelledAt: string | null;
  /**
   * Set once the lab result produced by this appointment has been released
   * into the portal. This is the link that lets a released report point back
   * at the appointment that produced it, and vice versa.
   */
  reportId: string | null;
}

export interface BookingRequest {
  panelId: string;
  addOnIds: string[];
  locationId: string;
  slotId: string;
  date: string;
  time: string;
  /**
   * The patient explicitly ticked the fasting acknowledgement. Sent so the
   * record of *when* they were told sits with the booking, not only in the
   * browser that made it.
   */
  fastingAcknowledged: boolean;
  /**
   * Randox's own BiologicalSexId, from their
   * `GET /BiologicalSex/GetBiologicalSex` reference list (1 = Male,
   * 2 = Female), resolved server-side from the patient's profile — never
   * mapped in a component. See packages/shared/src/biologicalSex.ts.
   *
   * Required rather than optional, deliberately. Their CreatePendingOrder
   * rejects an order without one, so making it optional here would only move
   * the failure from "we can't book this yet, and here's the one thing we
   * need" to a rejected order after the patient believed they were finished.
   */
  biologicalSexId: number;
}

export type BookingErrorCode =
  /** Someone else took the slot between it being listed and being booked. */
  | 'SLOT_TAKEN'
  | 'NOT_FOUND'
  /** Inside the change cutoff — has to go through the clinic instead. */
  | 'TOO_LATE_TO_CHANGE'
  | 'ALREADY_CANCELLED'
  /** The order itself is incomplete — e.g. no BiologicalSexId, which Randox requires. */
  | 'VALIDATION'
  | 'UNAVAILABLE';

export class BookingError extends Error {
  constructor(
    message: string,
    public code: BookingErrorCode,
  ) {
    super(message);
    this.name = 'BookingError';
  }
}

/**
 * The full surface the UI is built against. Any implementation satisfying
 * this — mock or Randox-backed — drops straight in.
 */
export interface BookingService {
  listPanels(): Promise<Panel[]>;
  listAddOns(): Promise<AddOn[]>;
  listLocations(): Promise<BookingLocation[]>;
  getAvailability(query: AvailabilityQuery): Promise<AvailabilityResponse>;
  book(request: BookingRequest): Promise<Appointment>;
  listAppointments(): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment | null>;
  reschedule(id: string, slot: { slotId: string; date: string; time: string }): Promise<Appointment>;
  cancel(id: string, reason?: string): Promise<Appointment>;
  /** The results→booking link: which appointment produced this released report. */
  findAppointmentForReport(reportId: string): Promise<Appointment | null>;
  /**
   * Hours before the appointment after which it can no longer be changed
   * online. Surfaced in the UI so the rule is stated up front rather than
   * only discovered by a rejected request.
   */
  readonly changeCutoffHours: number;
}
