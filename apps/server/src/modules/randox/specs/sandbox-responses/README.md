# Sandbox responses

**This directory is empty of captures, and that is the state of the work rather
than an oversight.**

The pass has not been run. It is one command:

```
npm run sandbox:pass --workspace=apps/server
```

and it needs four things this machine does not have. They are not in the
repository and they are not in `apps/server/.env`:

| Variable | Where it comes from |
| --- | --- |
| `RANDOX_NEXUS_SUBSCRIPTION_KEY` | the Nexus developer portal |
| `RANDOX_BOOKING_SUBSCRIPTION_KEY` | the Clinic Booking developer portal |
| `RANDOX_USERNAME` / `RANDOX_PASSWORD` | the Azure AD B2C account created at sign-up |

plus `RANDOX_ENABLED=true` and `RANDOX_TRANSPORT=live`. Everything else — both
base URLs, both client ids, both scopes, the token endpoint — is already
defaulted in `config/env.ts` and is correct.

`scripts/sandboxPass.ts` refuses to run without them, refuses to run against any
host that is not `stes-`, and refuses to run under `NODE_ENV=production`.

## Why nothing here is written in advance

Every file in this directory will be the **only** record of what these responses
look like. The Clinic Booking Postman collection carries no response examples at
all, which is why the client reads every booking response through the tolerant
helpers in `clients/parse.ts` while building every request literally.

A plausible-looking fixture placed here would be indistinguishable from a real
capture the moment anybody read it, and the whole value of the directory is that
it is evidence. So it stays empty until a real run fills it. The same rule the
analyte map runs on: an absent mapping is caught by the exception queue, and
nothing catches a wrong one.

## What a run produces

* `NN-<Endpoint>.json`, one per call, in the order the flow makes them, each
  carrying the request that produced it, the HTTP status, the parsed body and
  the **raw response text** — because "this is what our helpers made of it" is
  not a record of what Randox sent.
* `ANSWERS.md`, answering the seven open questions from the capture, and saying
  `UNANSWERED` in as many words where the run did not settle one.

## The seven questions

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

Three of these already have a **documented** answer, which is not the same as an
observed one and does not remove them from the list — the run is what turns a
sentence in a PDF into a fact about this integration:

* **5** — "Slots will be held for a 30 minute period."
  (`20241028-Corporate-Customer-API-Flow.pdf`, page 3.)
* **6** — "usually 7 days … The objective is to present 7 dates of available
  appointments, which depending on availability, **may not be consecutive
  dates**." (same document, page 2.)
* **2** — the OpenAPI document declares all eight as GET with no parameters.

## Location 30, not 15

The pass uses `LocationId` **30** ("Clinic Location Crumlin"), which Randox
confirm has real availability. Every example in the Postman collection uses 15,
which may have an empty diary — and an empty diary and a broken integration look
identical from the outside. Override with `SANDBOX_LOCATION_ID`.

## Nothing real goes near the sandbox

The fixture patient in `sandboxPass.ts` is invented, obviously invented, and
nothing in the script reads the database. Request headers are never captured, so
neither credential can end up in a file here.
