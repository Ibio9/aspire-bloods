# Sandbox responses

Clinic 1298 "Aspire Wellness Testing Clinic", panel 451 "Signature woman"
(SIGNF, 137 test items). See `ANSWERS.md` for what the current run settled and
what it did not — a question the run could not answer is written there as
`UNANSWERED`, and one it never asked is written as `UNASKED`, because those are
different states and only one of them is worth rerunning for.

**BOTH HALVES NOW RUN END TO END** — reference data, a pending order,
regions, locations, availability, hold, create, reschedule, a duplicate create
and a cancel. The booking half had never made a real call before this, and it is
where every defect in the last pass came from. Four of them, in order of how
quietly they would have failed:

1. **A slot is `{Id, Date, Time, AvailableQuantity}` in a bare array** — no
   combined datetime, no offset, no epoch. The client read
   `appointmentSlotDateTime` and four other invented names and turned **114 real
   slots into an empty diary**, which looks exactly like a clinic with no
   availability.
2. **The hold returns ONE id and the create needs two.** No `AppointmentId`
   comes back; sending the create without one is
   `400 "Randox Booking failure, invalid appointment id."` They are the same
   number, which the collection's own example (1144015 twice) already implied.
3. **The hold uses the same envelope as the reschedule, so a hold can refuse
   inside a 200.** The OpenAPI file declares those four fields on
   RescheduleAppointment alone; all four mutations carry them.
4. **A fourth error-body shape: a bare JSON string.** `parseRandoxErrorBody`
   required an object, so the only sentence naming the broken field was dropped
   — the same failure as the ProblemDetails one, in a new shape.

**And the probe was testing an endpoint that does not exist.** The pass used
`BiologicalSex/GetBiologicalSex`, the CB STES auth document's own worked
example, and Randox answered `404 {"statusCode": 404, "message": "Resource not
found"}`. A probe that 404s cannot tell a working subscription key from a broken
one, which is the only thing a probe is for. It is `GetServiceRegions` now: a
GET, no body, no order, nothing to clean up.

**The files here are ONE run.** A rerun clears the directory first (README
excepted) rather than writing over it file by file — captures are numbered by
step, so a shorter run would otherwise leave the tail of a longer earlier one
behind, with nothing in the filename to say it came from a different order on a
different day.

It is one command:

```
npm run sandbox:pass --workspace=apps/server
```

## What it needs, and where to put it

**Three variables. That is the entire list.**

| Variable | Where it comes from |
| --- | --- |
| `RANDOX_NEXUS_SUBSCRIPTION_KEY` | the Nexus developer portal |
| `RANDOX_USERNAME` | the Azure AD B2C ROPC account **created in** the developer portal |
| `RANDOX_PASSWORD` | the same account |

Put them in **`apps/server/.env.sandbox`** — copy `apps/server/.env.sandbox.example`
and fill in the three. That file is gitignored and is read only by this script.
The shell environment beats it, and it beats `apps/server/.env`.

Everything else — both `stes-` base URLs, both B2C client ids, both scopes, the
shared token endpoint, the two booking service ids and the sandbox test location
— is defaulted in `modules/randox/documentedDefaults.ts`, which is the same file
the server's env schema defaults from. One source, so the scope this script
sends and the scope production sends cannot drift apart.

**It does NOT need `RANDOX_ENABLED` or `RANDOX_TRANSPORT`.** Those are the
server's switches. This script is the live call by definition.

## The Clinic Booking half is optional

`RANDOX_BOOKING_SUBSCRIPTION_KEY` is a **separate key from a separate developer
portal**. Leave it unset and the pass runs the **Nexus flow alone**: it captures
the eight reference endpoints, creates a pending order and reads its status,
then writes `ANSWERS.md` recording that questions 4 to 10 went **unasked, and
why**. It does not fail. Booking is not in this portal's scope (see the
`VITE_BOOKING_ENABLED` note in CLAUDE.md), so that is the ordinary case rather
than an incomplete setup.

`ANSWERS.md` distinguishes the two states in as many words, because they are
different: *"we did not ask"* is worth rerunning for a key, and *"we asked and
learned nothing"* is not.

## It is standalone, and that took a change

It used to import `src/config/env.ts`, which parses the **server's whole**
configuration at module scope — so running it demanded `APP_BASE_URL`,
`API_BASE_URL`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`CSRF_SECRET`, `ENCRYPTION_KEY` and `FILE_SIGNING_SECRET`. It failed before
making a single call, listing eight things that have nothing to do with calling
an external API and none of the three that matter.

It reads `process.env` directly now, for the Randox settings only, and refuses
**by name** when a credential is missing. What it did *not* do is re-implement
the transport: it builds a `RandoxApiConnection` (see `modules/randox/connection.ts`)
and hands it to the real `RandoxHttpClient` — real B2C ROPC auth, real headers,
real pacing, real retry, real 401 handling. A capture taken through a second
implementation would be a record of the second implementation.

## Every safety check is unchanged

`scripts/sandboxPass.ts` refuses to run against any host that is not `stes-`
(checked on the resolved base URLs, and on the booking one only if the booking
half is running), refuses to run under `NODE_ENV=production`, sends an invented
patient, reads no database, and captures no request headers — so neither
credential can end up in a file here.

## Why nothing here is written in advance

Every file in this directory is the **only** record of what these responses look
like. The Clinic Booking Postman collection carries no response examples at all
and the OpenAPI definition's are `{statusCode, message}` envelopes rather than
payloads — with one exception, `RescheduleAppointmentResponse` — which is why
the client reads every booking response through the tolerant helpers in
`clients/parse.ts` while building every request literally.

A plausible-looking fixture placed here would be indistinguishable from a real
capture the moment anybody read it, and the whole value of the directory is that
it is evidence. So nothing is written here that a run did not produce. The same
rule the analyte map runs on: an absent mapping is caught by the exception
queue, and nothing catches a wrong one.

## What the first run taught, beyond the two answers

**The eight reference endpoints return BARE TOP-LEVEL ARRAYS**, not an object
with the list under a key — `GetPanels` is `[{id, name, code, panelType, …}]`
and not `{panels: […]}`. `pickArray` in `clients/parse.ts` handles that as its
first case, so the production client was always right; the first version of this
script had reinvented the helper and got it wrong, which is why its first
CreatePendingOrder went out with `PanelIds: []` and `TestReasons: [{Id: 1}]`
from a fallback.

**There is a third error-body shape and it is the one that names the field.**
The 400 came back as ASP.NET ProblemDetails —
`{"errors":{"Request":["No panels or test items provided"]}, "title":…,
"status":400, "traceId":…}` — with no `message` anywhere in it. The parser read
`status` for the code, found no `message`, and the one sentence explaining the
refusal was dropped. Fixed in `endpoints.ts` and pinned by
`tests/randoxErrorBody.test.ts`, which uses this body verbatim.

**`statusDate` comes back with no timezone at all** — `2026-08-14T09:42:38.39`,
two fractional digits, no `Z` and no offset — where the spec documents the .NET
round-trip form with a written-out `+00:00`. `toUtcIso` already appends `Z` when
no zone is present, which is correct given the spec's "all other times will be
UTC", so this confirms an assumption rather than exposing a bug.

**The externalNumber is `<clinic code>-<zero-padded orderId>`** — `AWL002` is
this clinic's own `code` from GetMyClinicDetails and `00163606` is orderId
163606. That is a **third** prefix format, after the spec's `GC1123-00010300`
and `GP-THE-00000130`. Nothing infers anything from it and nothing should: one
order is not a format.

## Prices are in these files, deliberately

`06-getPanels.json` and `08-getTests.json` carry `cost` and `currency` on all
616 panels and all 1189 tests, because that is what Randox sent. `stripPricing()`
removes them at the transport boundary in `clients/NexusLabClient.ts`, which
this script bypasses on purpose — a capture is the raw wire or it is not
evidence, and the strip has to be provable against something. They are ~1.5 MB
of Randox commercial pricing in the repository; that is a commercial question
rather than a patient-data one, and if it is the wrong answer the fix is to not
commit those two files rather than to sanitise them in place.

## What a run produces

* `NN-<Endpoint>.json`, one per call, in the order the flow makes them, each
  carrying the request that produced it, the HTTP status, the parsed body and
  the **raw response text** — because "this is what our helpers made of it" is
  not a record of what Randox sent.
* `ANSWERS.md`, answering the eleven open questions from the capture, and saying
  `UNANSWERED` in as many words where the run did not settle one.

## The eleven questions

1. Does the `orderNumber` returned by GetOrderStatus equal the `externalNumber`
   from CreatePendingOrder, byte for byte? — the one that would silently break
   automatic linking.
2. Do the eight reference endpoints take GET or POST on the live gateway?
3. Is there a stable analyte code on a result, or is the name the only
   identifier?
4. Do `BookingId` and `AppointmentId` come from the HoldAvailabilityBooking
   response? The collection sends the same value (1144015) for both.
5. What is the hold TTL in practice?
6. How many dates does AvailabilityDetails return, and are they consecutive?
7. Does a second CreateRandoxBooking against one `GPExternalNumber` succeed or
   fail?
8. Does GetServiceRegions work as the credential probe, and what is a region?
   — it replaced GetBiologicalSex, which 404s.
9. What does RescheduleAppointment return, and does a refusal arrive as a 200?
   — specified for the first time in `clinic-booking-openapi3.json`, and the
   only call on either API whose response schema can report a failure inside a
   success.
10. What `BiologicalSexId` does a booking carry, now that Clinic Booking has no
    endpoint for it? — **this one is answered as an ASSUMPTION and is labelled
    one.** See below.
11. Do the booking mutations share one response envelope, and can they refuse
    inside a 200? — yes to both, and it is the finding with a live defect
    behind it.

Three of these already have a **documented** answer, which is not the same as an
observed one and does not remove them from the list — the run is what turns a
sentence in a PDF into a fact about this integration:

* **5** — "Slots will be held for a 30 minute period."
  (`20241028-Corporate-Customer-API-Flow.pdf`, page 3.)
* **6** — "usually 7 days … The objective is to present 7 dates of available
  appointments, which depending on availability, **may not be consecutive
  dates**." (same document, page 2.)
* **2** — the OpenAPI document declares all eight as GET with no parameters.

Questions **4 to 11** are the Clinic Booking ones, and are the eight that go
unasked when that key is absent.

## Question 10 is an assumption, and says so

Clinic Booking publishes **no endpoint** listing biological sexes — that was
`GetBiologicalSex`, and it 404s. What is documented is one sentence in the
`CreateRandoxBooking` operation's own description in
`clinic-booking-openapi3.json`:

> Note - Biological Sex Id: Male = 1, Female = 2

That is a Clinic Booking statement about Clinic Booking, which is why it is used
rather than the obvious fallback of borrowing the Nexus id — two APIs behind two
gateways with two subscription keys do not share an id space by default. Nexus's
own `GetBiologicalSex` returns the same pair and the pass **cross-checks against
it and reports either way**, which is corroboration from an independent source
and is not confirmation.

**What stays open:** a prose note is not an enumeration. The spec still declares
an orphaned `BiologicalSexResponse` schema (`Id` / `Name` / `DisplayOrder`) that
no path references — an endpoint **withdrawn**, not one that never existed — so
the real list is likely longer than two and nothing here can enumerate it. A
name the note does not cover is **refused rather than guessed**: this field
decides which reference ranges a laboratory applies.

*For Randox: what is the full list of Clinic Booking BiologicalSexIds, and is
there an endpoint for them now that GetBiologicalSex has gone?*

## Location 30, not 15

The pass uses `LocationId` **30** ("Clinic Location Crumlin"), which Randox
confirm has real availability. Every example in the Postman collection uses 15,
which may have an empty diary — and an empty diary and a broken integration look
identical from the outside. Override with `SANDBOX_LOCATION_ID`.

## Nothing real goes near the sandbox

The fixture patient in `sandboxPass.ts` is invented, obviously invented, and
nothing in the script reads the database. Request headers are never captured, so
neither credential can end up in a file here.

## If a run crashes

`ANSWERS.md` is **not** written, deliberately — a summary of a run that stopped
halfway would read as a complete one. Whatever calls were captured before it
stopped are still here, numbered in order, and the console says how many.
