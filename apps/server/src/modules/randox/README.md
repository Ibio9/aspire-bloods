# Randox API integration

Two Randox APIs, one shared auth mechanism, one ingestion path into the
existing normalised store — and no way past the clinician release gate.

## What is verified and what is not

**Nexus Lab: verified.** Built against `specs/nexus-openapi.json` ("GP Test
Portal" v1.0) plus the four Randox flow and auth PDFs in `specs/`. Every
request and response shape in `types.ts` comes from an example in that spec.
There are no remaining guesses on the Nexus side.

**Clinic Booking: unverified.** No OpenAPI document exists for it — access
is still pending. What *is* documented (flow PDFs) and treated as fact: the
endpoint paths (`/Locations/GetServiceLocations`,
`/Availability/AvailabilityDetails`,
`/RandoxBookings/HoldAvailabilityBooking`,
`/RandoxBookings/CreateRandoxBooking`, plus `CancelRandoxBooking` and
`RescheduleAppointment`), the call order, that availability is UTC, that a
hold lasts 30 minutes, and that the Nexus order number crosses as
`GPExternalNumber`. The request and response *bodies* are assumed, read
through the tolerant helpers in `clients/parse.ts` so a wrong property name
degrades to "field absent" rather than crashing. When the spec arrives,
`types.ts` (Clinic Booking section) and `ClinicBookingClient.ts` are what
change; nothing above them does.

## Six things about this API that are easy to get wrong

1. **The order number comes back as `externalNumber`.** Not `orderNumber`.
   The spec says so in three separate endpoint descriptions. Reading
   `orderNumber` off a `CreatePendingOrder` response gets `undefined`.
2. **`/Order/*` endpoints are POST — including the `Get*` ones.**
   `GetOrderStatus`, `GetOrderResultDetail` and `GetOrderResultReports` all
   take a JSON body. The seven reference-data endpoints are plain `GET`.
3. **`result`, `refLow` and `refHigh` are strings**, and genuinely carry
   `"< 5.0"`, `"≥60"` and `"Not detected"` alongside `"5.85"`. See below.
4. **There is no void field.** `caveat` is one string, and void codes arrive
   in it. That is why classification is by configured map with
   unknown-means-void, not by which field a code turned up in.
5. **`dateOfReceipt` and `dateOfReport` are Europe/London**; everything else
   on the payload is UTC. The endpoint description states it verbatim.
6. **Two identifiers.** Integer `orderId` and string `orderNumber`, and
   several endpoints want both plus `clinicId`. All three are stored.

## The rules this is built around

**Nothing unknown is hardcoded.** `assertRandoxConfigured()` runs at boot
and fails the process, naming *every* missing variable at once, rather than
failing at the first API call — which would be the moment a patient is
standing in the clinic.

**A non-numeric result never becomes a number.** `clients/parseResult.ts` is
the whole of this rule. `"< 5.0"` is a detection limit, not a value:
recording 5.0 would put a number on a patient's record the laboratory did
not measure, and then plot it on a trend line. A comparator or qualitative
result yields `value: null`, keeps its text, and renders — with no range-bar
position and no trend point. One-sided ranges (`"<5.0"` / `"≥60"`, both real
on the example report) are reported as one-sided rather than having the
missing end invented; substituting 0 or Infinity would make every result on
that marker read as in range at one end.

**An unknown code is void.** A result carrying a void code produces no
`ReportResult` row at all — only a `ReportResultExclusion` and a neutral
"this test could not be reported" note. Not a greyed-out value, not a value
with a warning: there is no value in the database for a read path to leak. A
code absent from the configured map is void *by design*, not as a fallback,
and is recorded in `RandoxUnknownCode` (`GET /api/randox/unknown-codes`) so
the real list can be assembled from what actually arrives.

**Randox's own flag is compared, not trusted.** `lowHigh` is stored
verbatim; our status is always computed from the value against the range.
Where they disagree the disagreement is raised for an admin rather than
either being silently preferred — a mismatch usually means the range we
parsed is not the range the laboratory applied.

**A link is a reference, never a resemblance.** We create every order
ourselves against a known patient record, and Randox echo that order number
back on the result. That reference — the one we wrote down at the time — is
the *only* thing a result is ever attached on. Before the write, the identity
is corroborated: against the name and date of birth Randox return where they
supply them, and against the identity the order was placed under, snapshotted
on the order row at the moment `CreatePendingOrder` was sent. Anything that
disagrees, or that has nothing to corroborate it, goes to the exception queue
with the disagreement named. There is no code path in this module that
matches on name similarity, on a partial match, or on a probability. See
`identityCheck.ts`; the comparison functions are shared with the manual
linking flow (`lib/identityMatch.ts`) so the automatic bar can never end up
lower than the one a person is held to.

**Ingestion is not publication.** A clean parse lands at `ADMIN_VERIFIED` and
stops. An unclean one — an unmatched marker, a missing or one-sided range, a
disagreement with `lowHigh`, a lab that has not finished — lands at `PARSED`
and says why. That asymmetry is the safety property: `review` may only be
performed from `ADMIN_VERIFIED` and there is no other route into
`CLINICIAN_REVIEWED`, so a delivery with a hole in it cannot reach a
clinician's queue looking complete. Neither status is release; release is a
clinician's explicit act, enforced server-side.

## Shape

```
config.ts           every unknown, from env + JSON files, validated at boot
codes.ts            void/caveat classification — unknown codes fail closed
types.ts            wire contracts; Nexus verified, Booking marked unverified
errors.ts           RandoxApiError / RandoxAuthError / RandoxWindowExpiredError
auth/               Azure B2C ROPC token client — cached, one per API
http/               bearer + subscription key on every call, 401 retry,
                    transient retry with backoff, outbound rate limiting
clients/parse.ts    tolerant readers + the two timezone converters
clients/parseResult.ts  the string-value rules. Read this one.
clients/            live Nexus + Booking clients, and the mock/live factory
mock/               in-memory implementations + six result fixtures
orderService.ts     CreatePendingOrder / UpdatePendingOrder / CancelOrder
bookingService.ts   locations → availability → hold → book / cancel / reschedule
identityCheck.ts    may this be linked without anyone looking at it?
autoLink.ts         records the link and its evidence, or holds it with a reason
ingestionService.ts Randox payload → ParsedReport → the shared writer
referenceDataService.ts  the seven self-serve endpoints, cached + reconciled
catalogueLookup.ts  our catalogue key → Randox's integer id
pollingJob.ts       the trigger — written to be deleted when webhooks land
router.ts           staff endpoints under /api/randox
```

Writing a report is **not** here. That is
`modules/reports/materialiseReport.ts`, shared with the admin
result-linking flow (`modules/admin/linkingService.ts`) and entirely
unaware Randox exists. This module normalises and hands over.

## Running it before the credentials arrive

```
RANDOX_ENABLED=true
RANDOX_TRANSPORT=mock
```

Six fixtures, all shaped as the real payload:

| Scenario | What it exercises |
| --- | --- |
| normal | every analyte maps, numeric value, two-sided range |
| partially voided | a void code on a perfectly normal-looking value |
| fully voided | order moves to status 5, no report created |
| unmapped marker | a marker absent from the catalogue, plus an unknown code |
| partial results | analytes on the order not yet reported |
| awkward values | one-sided ranges, a comparator result, a qualitative result, and a `lowHigh` that disagrees with the range |

Going live is `RANDOX_TRANSPORT=live` plus the settings it needs. No code
changes. The full ordered checklist — which variable, where it comes from,
and where it goes — is in **DEPLOYMENT.md → Randox Nexus, going live**.

## Webhooks

`onOrderStatusChanged(orderNumber)` in `pollingJob.ts` is the seam. The
documentation confirms webhooks are coming ("In due course monitoring
options will be enhanced with the addition of appropriate web hooks but at
this time this polling endpoint must be used"). A webhook handler calls that
same function and nothing else changes.

## What is still outstanding

- **Subscription keys and the service-account credentials.** Developer
  portal access is pending.
- **Our clinic id and test-clinic-location id.** Readable from
  `GET /Clinic/GetMyClinicDetails` the moment access exists.
- **The panel and test ids.** Fetched live by the reference-data service and
  mapped to ours under **Panels → Randox panel mapping** — no hardcoding
  needed, but nothing can be ordered until an admin maps them.
- **The void/caveat code list.** The flow PDF says it comes from the Randox
  Business Team. Until then every code is unrecognised, and therefore void.
  The fixture codes are invented placeholders.
- **The default testing reason and cancellation reason ids.** Both are
  required by the API; ids come from the reference-data endpoints.
- **Which collection methods we may offer.** Note the documentation
  describes only two (home kit, in clinic) — `MOBILE_PHLEBOTOMY` is in our
  enum but is not a Randox method.

## Known gap: biological sex at signup

`CreatePendingOrder` marks `BiologicalSexId` **required**. Self-registration
(`patientProfileFormSchema` in `packages/shared`) captures `sex` as
**optional**, and the registration form marks the field optional too. Date
of birth is already required, so that half is fine.

So an account can exist that no Randox order can be placed against.
`placeOrder()` refuses such an order with an explicit message rather than
defaulting a sex — sex-specific reference ranges depend on it, and guessing
changes which ranges the laboratory applies. Affected patients are listed at
`GET /api/randox/patients-not-orderable` so staff find out before they try.

Making the field required at signup was left alone deliberately: it would
change a registration flow that just shipped, and it does not fix the
accounts that already exist. That is a product decision, not a code fix.

## Things deliberately not built

- **`CreateOrder` / `UpdateOrder`** (the sample-collection-complete path)
  and `UpdateConsultationNote`. We create pending orders and let the
  collection method complete them.
- **The Home Test Kit Dispatch portal.** A third API suite with its own
  endpoints; home-kit orders currently place in Nexus and stop there.
- **A patient-facing Randox booking UI.** The API surface exists; the
  front-end for it wasn't in scope.
- **Caveat display to patients.** Structurally supported
  (`patientSafeNote`, `ReportResult.caveatCodes`) but every note is blank
  until we know what each code means.
- **UI for patient measurements.** Stored (`ReportMeasurements`), not shown.
