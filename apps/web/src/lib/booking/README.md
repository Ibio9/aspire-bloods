# Booking — what the Randox API has to provide

The patient-facing booking flow is complete and built entirely against
[`types.ts`](./types.ts). It is currently served by a mock. Going live is a
**single-file change**.

## The four files, and which of them move

| File | Contents | Changes at integration? |
| --- | --- | --- |
| `types.ts` | Domain types + the `BookingService` interface | **No** |
| `catalogue.ts` | Aspire's own product content — panels, add-ons, clinics, fasting rules | **No** |
| `prep.ts` | Pure derivations — fasting windows, timing conflicts, turnaround maths | **No** |
| `bookingService.ts` | The mock implementation | **Yes — replaced wholesale** |

No component in `features/booking` imports anything else from this folder.
Rewrite the body of `bookingService.ts` against the real endpoints, keep the
export named `bookingService` at the same path, and the UI is unchanged.

Two things in the mock must be **deleted**, not ported:

1. The `findAppointmentForReport` fallback that lets the seeded past
   appointment adopt the first report it is asked about. It is marked
   `MOCK ONLY` in the file.
2. `__resetMockBookings` and the `localStorage` store.

## Endpoint by endpoint

Times are **clinic-local** throughout — `YYYY-MM-DD` for dates, `HH:MM`
24-hour for times, kept as separate fields deliberately. A single UTC instant
would be wrong here: an 8am appointment is 8am to the patient regardless of
what the server thinks, and the fasting window is computed against the wall
clock the patient will be looking at.

### 1. Availability — `getAvailability(query) → AvailabilityResponse`

Given a clinic, a panel, the selected add-ons and an inclusive date range,
return one entry **per calendar day in the range**, including the days with
nothing on them.

Required of the response:

- **Every empty day carries a `closedReason` in plain English.** A day with
  zero slots and no reason is the one shape the UI cannot render usefully —
  "closed on Sundays", "fully booked" and "too soon to book" are three
  different answers and the patient needs to know which one they have hit.
- **`nextAvailableDate`** — the first bookable date after the requested
  window, when the whole window is empty. This is what powers the "jump to the
  next date with availability" affordance; without it the patient has to page
  forward blind.
- **Slot duration** must reflect the panel and its add-ons. The UI shows it,
  and it is what a patient allows time for.
- **`slot.id` is opaque** to the UI and round-tripped verbatim into `book` and
  `reschedule`. Make it whatever the booking system needs to identify a slot
  atomically.

The date range requested is a **7-day window** at a time.

### 2. Booking a slot — `book(request) → Appointment`

`BookingRequest` carries the panel, the add-ons, the clinic, the slot (id +
date + time) and `fastingAcknowledged`.

- **`fastingAcknowledged` must be stored on the booking record.** The patient
  ticks an explicit acknowledgement naming the exact time they must stop
  eating; that acknowledgement belongs with the appointment, not only in the
  browser that made it. It is evidence the instruction was given.
- **Slot contention must return `SLOT_TAKEN`**, not a generic failure. The UI
  keeps every other selection and sends the patient back to the time step
  only.
- The returned `Appointment` must include a **human-quotable `reference`** —
  patients read it out on the phone.
- Add-ons the chosen clinic cannot draw are still ordered (a kit is posted
  instead) and must stay on the appointment. Do not silently drop them.

### 3. Cancellation — `cancel(id, reason?) → Appointment`

- **Cancel is a state change, never a delete.** The returned appointment comes
  back with `status: 'CANCELLED'` and `cancelledAt` set, and continues to be
  returned by `listAppointments`. This matches the no-hard-deletes rule the
  rest of the product follows.
- Inside the change cutoff, return `TOO_LATE_TO_CHANGE`. The UI already
  states the cutoff up front and offers the clinic's phone number instead.

### 4. Rescheduling — `reschedule(id, slot) → Appointment`

- Same appointment id, same reference, new date and time. A reschedule must
  **not** be modelled as cancel-plus-rebook, because the reference the patient
  has already been given has to survive.
- The appointment being moved must not block its own new slot.
- Same `SLOT_TAKEN` and `TOO_LATE_TO_CHANGE` codes as above.

### 5. Confirmation

There is no separate confirm endpoint. `book` returning an `Appointment` **is**
the confirmation, and the UI renders the summary from it. Whatever email or
SMS Randox sends is additional, not the thing the patient waits on.

If confirmation ever becomes asynchronous (a `PENDING` state that resolves
later), add a status to `AppointmentStatus` rather than making `book` return
early — the confirmation screen states, as fact, that the appointment exists.

### 6. Results → booking — `findAppointmentForReport(reportId)`

The portal links a released report back to the appointment that produced it.
For that, **the result payload Randox returns must carry the booking
reference**, and the ingestion path must persist it onto the report so this
lookup is a join rather than a guess.

This is the one requirement that reaches outside the booking flow, and it is
worth stating explicitly to Randox up front: a result with no booking
reference on it cannot be traced back to the appointment, and the link is not
reconstructable afterwards.

### 7. Change cutoff — `changeCutoffHours`

A number, not a hardcoded constant in the UI, so the clinic's policy can move
without a deploy. Currently 24.

## Error codes

`BookingError` carries one of: `SLOT_TAKEN`, `NOT_FOUND`,
`TOO_LATE_TO_CHANGE`, `ALREADY_CANCELLED`, `UNAVAILABLE`. Every one of them
has a distinct patient-facing recovery in the UI. A real API that collapses
them into HTTP status codes should be mapped back to these in the service
layer, not surfaced as status numbers.

## What is *not* Randox's to provide

Panel composition, marker counts, covering copy, turnaround estimates,
fasting windows and the clinic descriptions are Aspire's content and live in
`catalogue.ts`. If the real API also returns some of this, prefer the
catalogue for anything patient-facing — the fasting rules in particular are a
clinical decision, not a lab configuration.
