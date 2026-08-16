# The sandbox pass

Captured 35 calls. Every response body is beside this file, one per call, with the request that produced it.

Order: orderId `163816`, externalNumber `AWL002-00163816`. Clinic id `1298`.

What the order carried, every value read from a reference capture rather than from config:

| Field | Value |
| --- | --- |
| Panel | 451 (SIGNF, Signature woman, 137 items) |
| Test item | — |
| Testing reason | 7 — Wellness screening / health check |
| Biological sex | 2 (Female) |
| TestClinicLocationId | 1298 |

**Clinic Booking: run.**

## 1. Does the orderNumber returned by GetOrderStatus equal the externalNumber from CreatePendingOrder, byte for byte?

YES. Every GetOrderStatus response returned `AWL002-00163816`, identical to the creation response's externalNumber. reconcileOrderNumber() can be simplified once a second order agrees.

## 2. Do the eight reference endpoints take GET or POST on the live gateway?

GET. All 8 answered 2xx to GET: getBiologicalSex 200, getCancellationReasons 200, getEthnicity 200, getClinicStaff 200, getMyClinicDetails 200, getPanels 200, getTestingReasons 200, getTests 200. The spec is right and RANDOX_REFERENCE_DATA_METHOD=get is correct.

## 3. Is there a stable analyte code on a result, or is the name the only identifier?

UNANSWERED — no result detail was returned in this run (the order did not reach status 4).

## 4. Do BookingId and AppointmentId come from the HoldAvailabilityBooking response?

BookingId PRESENT, AppointmentId ABSENT.

**THE HOLD RETURNS ONE ID AND THE CREATE NEEDS TWO.** No AppointmentId comes back at all. A create sent without one is refused `400 "Randox Booking failure, invalid appointment id."` — Randox name the field, which is how this was found.

**SO THEY ARE THE SAME NUMBER, AND THAT IS NOW OBSERVED RATHER THAN INFERRED.** This run sent `AppointmentId: 87832` — the hold's own BookingId — and the create answered 200. That agrees with the collection's example, which sends 1144015 for both, and with the hold being the only call before the create that could have produced either.

## 5. What is the hold TTL in practice? (documented 30 minutes)

The hold response states NO expiry. The 30 minutes stays a client-side deadline (HOLD_DURATION_MS), which is what confirmBooking now enforces before calling Randox.

## 6. How many dates does AvailabilityDetails return, and are they consecutive?

5 distinct dates across 114 slots: 2026-08-17, 2026-08-18, 2026-08-19, 2026-08-20, 2026-08-21. Consecutive. — which matches the flow document: "The objective is to present 7 dates of available appointments, which depending on availability, may not be consecutive dates."

## 7. Does a second CreateRandoxBooking against one GPExternalNumber succeed or fail?

UNANSWERED — the second create was not sent.

## 8. Does GetServiceRegions work as the credential probe, and what is a region?

YES (200). It answers GET with no body, so the booking subscription key and B2C scope are both working. The previous probe, `BiologicalSex/GetBiologicalSex`, 404s — it is in the CB auth document's worked example and in no operation list — so it could not tell a good key from a bad one. The body is beside this file; region ids are NOT service ids and nothing published relates the two.

## 9. What does RescheduleAppointment return, and does a refusal arrive as a 200?

HTTP 200. SuccessFailCode `Success`, FailureDescription `null`, BookingId `87832`.

The soft-failure shape is real. `bookingOutcomeSucceeded()` treats anything not recognisably affirmative as a failure, which is the safe direction; check the capture for the exact spelling before relying on it.

This does NOT by itself move production onto the endpoint. bookingService.rescheduleBooking still composes hold → create → cancel, because the documented reschedule takes no hold and so cannot check the new slot is free before giving up the old one.

## 10. What BiologicalSexId does a booking carry, now that Clinic Booking has no endpoint for it?

**AN ASSUMPTION, NOT AN ANSWER.** `2` for "Female", taken from the CreateRandoxBooking operation's own description in clinic-booking-openapi3.json: "Note - Biological Sex Id: Male = 1, Female = 2".

`BiologicalSex/GetBiologicalSex` — the CB auth document's worked example — answered **404** and is not an operation on this API, so there is nothing to resolve against and nothing that could confirm this.

CROSS-CHECK: Nexus's own GetBiologicalSex returns `2` for "Female", which AGREES. That is corroboration from an independent source and it is not confirmation — they are two APIs behind two gateways with two subscription keys.

WHAT IS STILL OPEN: the spec declares an orphaned `BiologicalSexResponse` schema (Id / Name / DisplayOrder) that no path references, which means an endpoint was WITHDRAWN rather than never existing — so the real list is likely longer than two and nothing here can enumerate it. **For Randox: what is the full list of Clinic Booking BiologicalSexIds, and is there an endpoint for them?**

## 11. Do the booking mutations share one response envelope, and can they refuse inside a 200?

**YES, AND THE SPEC DECLARES IT ON ONE OPERATION.** 3 of 4 mutations answered with a `SuccessFailCode`: HoldAvailabilityBooking `Success`, CreateRandoxBooking `0`, RescheduleAppointment `Success`.

The OpenAPI file calls this `RescheduleAppointmentResponse` and attaches it to RescheduleAppointment alone, which is how it was read at first. It is the shared envelope for booking mutations — so **a refusal arrives as an HTTP 200 and the transport does not throw**. A create read as a success writes an appointment the patient does not have and then tells them to come in, which is the worst outcome this API can produce. `assertBookingOutcome` in clients/ClinicBookingClient.ts reads it on all four.

**AND THE CODE IS NOT ONE TYPE.** Note the values above: a string on three of them and a NUMBER on the create. `pickString` coerces and "0" is in the success set, so both read — do not "tidy" that set to strings only.

