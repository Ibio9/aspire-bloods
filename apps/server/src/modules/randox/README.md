# Randox API integration

Two separate Randox APIs, one shared auth mechanism, one ingestion path
into the existing normalised store — and no way past the clinician release
gate.

## Sourcing note — read this first

**The documentation PDFs were not present in the repository.** Nothing
matching `*.pdf` exists anywhere in the tree, tracked or untracked. This
module is therefore built from the written brief: endpoint names, the auth
mechanism, base URLs, client ids, the order lifecycle, the numeric status
codes (1–5), the 30-minute hold, UTC availability, `GPExternalNumber`,
base64 PDF reports, and the existence of void/caveat codes.

What the brief does **not** pin down — exact request/response property
names, envelope shapes, HTTP verbs and paths for each named operation, and
Randox's error-code vocabulary — is guessed, and every guess is marked in
`types.ts` and `clients/parse.ts`. The wire layer reads several plausible
spellings of each field so a casing mismatch degrades to "field absent"
(handled) rather than a crash. See "Ambiguities" below.

## Shape

```
config.ts        every unknown, loaded from env + JSON files, validated at boot
codes.ts         void/caveat classification — unknown codes fail closed
types.ts         wire contracts + the documented 1–5 status mapping
errors.ts        RandoxApiError / RandoxAuthError / RandoxWindowExpiredError
auth/            Azure B2C ROPC token client — cached, one instance per API
http/            bearer + Ocp-Apim-Subscription-Key on every call, 401 retry
clients/         live Nexus + Booking clients, and the mock/live factory
mock/            in-memory implementations + the five result fixtures
orderService.ts  CreatePendingOrder / UpdatePendingOrder / CancelOrder
bookingService.ts locations → availability → hold → book / cancel / reschedule
ingestionService.ts results → normalised store, stopping at ADMIN_VERIFIED
pollingJob.ts    the trigger — written to be deleted when webhooks land
router.ts        staff-facing endpoints under /api/randox
```

## The three rules this is built around

**1. Nothing unknown is hardcoded.** Subscription keys, clinic id, panel
and test ids, credentials, base URLs, the code map and the permitted
collection methods are all env vars or JSON config. `assertRandoxConfigured()`
runs at boot and fails the process, naming *every* missing variable at once,
rather than failing at the first API call — which would be the moment a
patient is standing in the clinic.

**2. An unknown code is void.** A result carrying a void code produces no
`ReportResult` row at all — only a `ReportResultExclusion` and a neutral
"this test could not be reported" note. Not a greyed-out value, not a value
with a warning: there is no value in the database for a read path to leak.
A code that isn't in the configured map is treated as void by design, not
as a fallback, and is recorded in `RandoxUnknownCode` so the real list can
be assembled from what actually arrives (`GET /api/randox/unknown-codes`).

A void code arriving in Randox's *caveat* field still voids. The field a
code arrives in is a hint, not an authority.

**3. Ingestion is not publication.** Results land at `ADMIN_VERIFIED` and
stop. Clinician review and release are unchanged, explicit, human actions.

## Running it before the credentials arrive

```
RANDOX_ENABLED=true
RANDOX_TRANSPORT=mock
```

The mock implements both documented contracts in memory, including the
parts our code has to survive: status advances 2 → 3 → 4 rather than
jumping to results, holds expire and are single-use, windowed operations
start failing once an order has moved on, and an order whose results are
all voided reports status 5.

Five fixtures, selected by a marker in the patient reference
(`…+voided`, `…+fully-voided`, `…+unmapped`, `…+partial`, or none):

| Scenario | What it exercises |
| --- | --- |
| normal | every analyte maps, has a value and a range |
| partially voided | a void code on a perfectly normal-looking value |
| fully voided | order-level void → status 5, no report created |
| unmapped marker | a marker absent from the catalogue, plus an unknown code |
| partial results | analytes still pending; redelivery merges into one report |

Going live is `RANDOX_TRANSPORT=live`. No code changes.

## Webhooks

`onOrderStatusChanged(orderNumber)` in `pollingJob.ts` is the seam. The
sweep decides *when* to look at an order and calls it; a webhook handler
would call the same function with the order number from the callback body
and need to change nothing else. All ingestion, mapping, code handling and
storage lives below that line, so deleting the polling schedule is safe.

## Ambiguities I had to guess at

Flagged here rather than buried in code comments, because each one wants
confirming against the real specs.

1. **Request/response property casing.** Azure/.NET APIs commonly return
   PascalCase; APIM often re-serialises to camelCase. Handled by reading
   several spellings (`clients/parse.ts`), which should be narrowed once
   confirmed.
2. **Paths and verbs per operation.** Only operation *names* were given.
   Assembled as `{base}/{OperationName}`, POST for mutations and GET with
   query parameters for reads. All in the two client classes.
3. **The B2C token endpoint, and whether both APIs share one.** ROPC needs
   a tenant and policy name; neither was available. Hence
   `RANDOX_B2C_TOKEN_URL` plus per-API overrides.
4. **The scope strings.** Not documented. Left as required env vars.
5. **Whether ROPC uses a service account or per-user credentials.** Assumed
   a single service account (there is nowhere else for the password to come
   from in a server-to-server integration), with per-API overrides in case
   they issue two.
6. **The error vocabulary for a closed window.** No error-code list was
   available, so `looksLikeWindowExpired()` matches on HTTP status plus
   body wording. This is deliberately broad and should be narrowed to real
   codes — a *missed* window-expiry is only mis-reported as a fault, never
   mis-treated as success, so the failure mode is a confusing message
   rather than a wrong result.
7. **Whether void/caveat codes appear at order level, analyte level, or
   both.** Handled as both; order-level codes are applied to every analyte.
8. **Patient sex vocabulary** on the order payload (`Male`/`Female`/
   `Unknown` assumed).
9. **Whether `GetOrderResultReports` returns one report or several.**
   Handled as an array, falling back to treating the body itself as one
   report. The first is attached as the report's original PDF; any others
   attach as generated files.
10. **Partial-result signalling.** Assumed a per-analyte `pending` flag.
    If Randox instead signal it order-level, it changes in `mapResultItem`.
11. **How long the amendment window is.** Only "limited" was documented.
    Not modelled locally at all — we attempt the call and treat Randox's
    rejection as authoritative, which is the right way round regardless.

## Things deliberately not built

- **A patient-facing booking UI.** The API surface is there
  (`/api/randox/service-locations`, `/availability`, `/orders/:n/hold`,
  `/book`); the front-end for it wasn't in scope.
- **Home-kit and mobile-phlebotomy fulfilment.** Those orders place
  normally and never touch the Booking API, which is correct, but whatever
  dispatch/tracking they need on Randox's side isn't documented anywhere
  we have.
- **Caveat display to patients.** Structurally supported
  (`patientSafeNote` in the code map, `ReportResult.caveatCodes`), but
  every note is blank until we know what each code means.
