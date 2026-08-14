# Deployment

## Topology

```
blood.aspireshield.com          →  Vercel   (apps/web — static SPA)
api.blood.aspireshield.com      →  Railway  (apps/server — Node API)
                                     Railway  (Postgres, same project)
```

Two separate deploys, not one service serving both. This matters for one specific reason: the session cookie is `httpOnly` and the API is the only thing that can set or read it. If the frontend and API sat on unrelated domains (`*.vercel.app` and `*.railway.app`), that cookie would be **third-party** from the browser's point of view — Safari and Firefox block third-party cookies outright, and Chrome is moving the same direction. Putting both under one parent domain (`blood.aspireshield.com`) with the cookie scoped to `blood.aspireshield.com` keeps it first-party: every browser treats a cookie set by `api.blood.aspireshield.com` as valid for `blood.aspireshield.com` too, because they share a registrable domain.

This is why `COOKIE_DOMAIN=blood.aspireshield.com` (see `.env.example`) is not optional in production — without it the cookie is scoped to the API subdomain only and the frontend will never see it, and login will appear to succeed (the API sets the cookie) but every subsequent request will look unauthenticated. **No leading dot** — that old Netscape-era syntax isn't needed under RFC 6265 (domain-matching already covers subdomains without it) and at least one cookie-serialising library in this app's dependency tree rejects it outright with `option domain is invalid`, which crashed every successful login/OTP-verify in an earlier deploy (that's the one request that actually sets the cookie). The app now refuses to boot in production if `COOKIE_DOMAIN` starts with a dot, specifically to catch this before it reaches a real request.

**If the custom domains aren't live yet** (DNS not propagated, certs not issued) and you need a working deploy sooner: add a Vercel rewrite proxying `/api/*` to the Railway `*.up.railway.app` URL, which makes every request same-origin from the browser's perspective and sidesteps the cookie problem entirely, at the cost of an extra hop through Vercel's edge for every API call. This isn't wired up by default because the Railway URL doesn't exist until you've created the service — see "Fallback: same-origin proxy" below if you need it.

## First-time setup

### 1. GitHub

- [ ] Create a **private** repo `Ibio9/aspire-bloods` on github.com (I can't create it for you — no `gh` CLI available in this environment and no GitHub credentials).
- [ ] Push this repo to it:
  ```
  git remote add origin https://github.com/Ibio9/aspire-bloods.git
  git push -u origin master:main
  ```
  (the local default branch is `master`; push it to `main` on GitHub since that's what `ci.yml`/`railway.json`/branch protection below all assume).
- [ ] **Settings → Branches → Add branch protection rule** for `main`:
  - Require a pull request before merging
  - Require status checks to pass before merging → select the `verify` job from the CI workflow (it'll appear in the list after the first CI run on a PR)
  - Do not allow direct pushes (no bypass for anyone, including yourself, unless you deliberately want an escape hatch)
I already checked: git history has no committed `.env` files and no secret-shaped strings anywhere in any commit (checked file-by-name and by content-pattern across the full history) — safe to push as-is.

### 2. Railway — API + Postgres

- [ ] New Railway project. **Add a Postgres service** first (Railway → New → Database → PostgreSQL) — this gives you `DATABASE_URL` automatically for the next step.
- [ ] **Add a second service** → Deploy from GitHub repo → select `Ibio9/aspire-bloods`. Leave **Root Directory at the repo root** (not `apps/server`) — this is an npm-workspaces monorepo, and `apps/server`'s dependency on `packages/shared` only resolves correctly when `npm ci` runs from the root. `railway.json` at the repo root points Railway at `apps/server/Dockerfile` (built with the repo root as context) rather than letting Railway auto-detect a build — a plain auto-detected build was installing and trying to build `apps/web` too (it isn't needed here at all; it deploys separately, to Vercel) and hit a file-locking error doing it. The Dockerfile:
  - Installs only `packages/shared` + `apps/server`'s dependencies (`npm ci --workspace=...`, one install, nothing implicit running before or after it)
  - Builds `packages/shared`, generates the Prisma client, builds `apps/server`, installs OpenSSL (Prisma's query engine needs it and the slim base image doesn't include it)
  - Copies the built output, `prisma/`, and `src/` (the seed scripts run via `tsx` against the TS source, not the compiled output — see below) into a fresh runtime layer, plus production node_modules
  - Start command: `prisma migrate deploy && tsx prisma/seed.ts && node dist/index.js` — **a failed migration or seed exits non-zero before the server ever starts listening**, so Railway's healthcheck never passes and it keeps the previous deployment serving traffic instead of cutting over to a broken schema. The seed step is what actually populates `Panel`/`Marker`/`Source`/`ReferenceRange` — without it every admin picker (patient/panel/source/marker) is empty and PDF upload/manual entry both fail immediately on a fresh database. It's idempotent (every row is an upsert keyed on a stable `key`) and cheap, so running it on every boot is deliberate, not a shortcut — a config change to the catalogue (e.g. a new panel added via `prisma/seed.ts`) rolls out on the next deploy with no separate migration step. It's also `NODE_ENV`-aware: in production it seeds only the catalogue/copy/consent data, never the dev staff logins or demo patient (those exit early on `NODE_ENV=production`, see the seed script's own guard).
  - Healthcheck path: `/api/health`

  Built and ran this exact Dockerfile locally end-to-end before committing it (`docker build`, then `docker run` against a **freshly created, empty** local Postgres, in `NODE_ENV=production` with all the real boot-check env vars set) — confirmed the migration step runs, the seed step populates the catalogue (verified row counts directly in the database), the production boot checks pass, `/api/health` responds correctly, and a real login + PDF upload + manual-entry submission all complete successfully end to end against the seeded data.
- [ ] Service → **Variables**, add every variable from `.env.example` except `DATABASE_URL` (Railway injects that automatically from the Postgres service — use the "Add Reference" picker rather than pasting it). In particular:
  - `NODE_ENV=production`
  - `APP_BASE_URL=https://blood.aspireshield.com`
  - `API_BASE_URL=https://api.blood.aspireshield.com`
  - `COOKIE_DOMAIN=blood.aspireshield.com` (**no leading dot** — see the topology note above)
  - `ADMIN_EMAILS=<the practice's real admin email(s)>`
  - `EXPOSE_DEV_OTP_CODE=false` (or just leave it unset)
  - Real secrets for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`, `FILE_SIGNING_SECRET`, `ENCRYPTION_KEY` — generate with the commands in the README, **not** the placeholder values from `.env.example`. The app refuses to boot in production if it detects the literal placeholder strings, a missing `ADMIN_EMAILS`/`RESEND_API_KEY`, `EXPOSE_DEV_OTP_CODE=true`, or a malformed `COOKIE_DOMAIN` (still `localhost`, or starting with a dot) — see `lib/productionBootChecks.ts`.
  - `RESEND_API_KEY=<real Resend key>` — required; without it the email provider falls back to printing OTP codes and patient addresses to the console.
  - `STORAGE_ROOT=/data/storage` (see "PDF storage" below)
- [ ] Service → **Settings → Networking → Generate Domain**, or add the custom domain directly: `api.blood.aspireshield.com`. Railway will show a CNAME target — that's the IONOS record below.
- [ ] Service → **Settings → Volumes → New Volume**, mount path `/data/storage`. This is where uploaded PDFs live — see reasoning below.

**PDF storage — Railway Volume, not object storage.** The original `StorageAdapter` interface was built swappable specifically for this decision (`LocalDiskStorageAdapter` now, `S3StorageAdapter` later if ever needed). At this practice's scale (single API instance, not planning horizontal scaling), a Railway Volume gets you off the ephemeral container filesystem with **zero code changes** — the existing HMAC-signed-URL download flow, encryption-at-rest handling, and `StorageAdapter` abstraction all keep working exactly as designed, just pointed at a persistent mount instead of the container's disk. Object storage (S3/R2) would be more "correct" for a multi-instance or high-scale deployment, but that's not this deployment, and it means a new external account, new credentials to secure, and a new adapter to write for a scaling need that doesn't exist yet. If the practice later needs multi-instance Railway or wants geo-redundant file storage, swapping in `S3StorageAdapter` behind the same interface is the clean upgrade path — nothing else in the codebase would need to change.

- [ ] **Add a third service for the nightly backup.** This is its own runbook, because it is the step that was skipped and left the practice with no off-platform backup at all — see [Database restore → Standing up the backup cron service](#standing-up-the-backup-cron-service). In short: new service from this repo, Config-as-code path `railway.backup.json`, and the variables in the table there.

### 3. Vercel — frontend

- [ ] New Vercel project → import `Ibio9/aspire-bloods` from GitHub. Framework preset: **Vite**. Leave the root directory as the repo root — `vercel.json` at the repo root already sets `buildCommand` (builds `packages/shared` first, then `apps/web`), `outputDirectory` (`apps/web/dist`), the SPA rewrite (so client-side routes don't 404 on refresh), and security headers (HSTS, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a CSP that only allows `connect-src` to `https://api.blood.aspireshield.com` — no third-party fonts/analytics/anything).
- [ ] Project → **Settings → Environment Variables**, add `VITE_API_BASE_URL`:
  - **Production**: `https://api.blood.aspireshield.com`
  - **Preview**: the staging Railway API URL — **never** the production URL (see "Preview deploys" below)
- [ ] Do **not** set `VITE_BOOKING_ENABLED`. Unset is off, which is the intended production state — see "Feature flags" below.
- [ ] Project → **Settings → Domains**, add `blood.aspireshield.com`. Vercel will show the record to add — that's the other IONOS record below.

### 5. Preview deploys → separate staging API

Every PR gets a Vercel preview deploy automatically once the project is connected — that's Vercel's default behavior, nothing extra to configure there. What needs deliberate setup is making sure those previews never touch production patient data:

- [ ] In Railway, create a **second** Postgres service and a **second** API service (same repo, same `railway.json`), in a separate Railway environment or project named something like `aspire-bloods-staging`. Run `prisma migrate deploy` and the seed script against it once, so it has the same schema and non-sensitive demo data as local dev — never copy production data into it.
- [ ] Set that staging API service's own env vars — same list as production, but `ADMIN_EMAILS` pointing at a test admin address, `RESEND_API_KEY` can reuse the same Resend account (emails just go to whatever test addresses you sign up with), and `APP_BASE_URL` set to `*` is not valid for CORS — instead set it to Vercel's preview URL pattern is not possible either (previews get unique URLs per-deploy). Simplest working setup: set staging's `APP_BASE_URL` to your primary preview testing URL, or relax CORS specifically on the staging service only (never on production) to accept any `*.vercel.app` origin.
- [ ] Get the staging API's Railway-assigned URL (`<staging-service>.up.railway.app`) and set it as `VITE_API_BASE_URL` under the **Preview** environment in Vercel's project settings (step above).

Production `VITE_API_BASE_URL` (Production environment) always points at `api.blood.aspireshield.com`, never at staging — the environment-scoped variables in Vercel keep these from ever crossing over.

### 4. IONOS — DNS

You mentioned the apex domain (`aspireshield.com`) already has a CNAME conflict from the existing Rota setup, so this follows the same subdomain-only pattern:

| Type | Host/Name | Points to | Notes |
|---|---|---|---|
| CNAME | `blood` | (the target Vercel shows you in Domains — typically `cname.vercel-dns.com`) | frontend |
| CNAME | `api.blood` | (the target Railway shows you in Networking — typically `<service>.up.railway.app`) | API |

After adding both, verify against a public resolver rather than your own machine's (which may have a stale cached answer):

```
nslookup blood.aspireshield.com 8.8.8.8
nslookup api.blood.aspireshield.com 8.8.8.8
```

Both should resolve to the CNAME targets above. Once they do, both Vercel and Railway will automatically issue TLS certificates (Let's Encrypt) for their respective domains — this can take a few minutes after DNS first resolves. Confirm both `https://blood.aspireshield.com` and `https://api.blood.aspireshield.com/api/health` load over HTTPS, and that plain `http://` on either redirects to `https://`.

### Fallback: same-origin proxy (only if custom domains aren't ready)

If you need a working deploy before DNS/certs are sorted: in `vercel.json`, add a rewrite **before** the SPA catch-all —

```json
{ "source": "/api/:path*", "destination": "https://<your-service>.up.railway.app/api/:path*" }
```

— using the actual Railway-assigned URL. This makes `/api/*` requests same-origin from the browser (routed through Vercel's edge to Railway), so the cookie problem never comes up regardless of `COOKIE_DOMAIN`. Set `VITE_API_BASE_URL` to empty (same-origin relative paths) when using this path. **This is a stopgap, not the target state** — switch to the custom-domain setup above once DNS is live, since the extra proxy hop adds latency to every request.

## Secrets — where each one lives

| Secret | Railway (API service) | Railway (backup cron service) | Vercel |
|---|---|---|---|
| `DATABASE_URL` | ✅ (auto-injected from Postgres service) | ✅ (**private** reference — never the public connection string) | |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `CSRF_SECRET` / `FILE_SIGNING_SECRET` / `ENCRYPTION_KEY` | ✅ | | |
| `ADMIN_EMAILS` | ✅ | | |
| `RESEND_API_KEY` | ✅ | | |
| `ESCALATION_EMAIL` (not a secret — staff routing, and production refuses to boot without it) | ✅ | | |
| `COOKIE_DOMAIN` / `APP_BASE_URL` / `API_BASE_URL` | ✅ | | |
| `BACKUP_S3_*` / `BACKUP_RETENTION_DAYS` (off-platform backup target) | | ✅ | |
| `VITE_API_BASE_URL` | | | ✅ |
| `VITE_BOOKING_ENABLED` (not a secret — a build-time feature flag, deliberately unset) | | | ✅ |

Nothing above should ever be committed to the repo — `.env`, `.env.local`, and friends are gitignored, and `.env.example` only ever holds placeholder values (the app refuses to boot in production if it detects the literal placeholder strings).

### Tunable at runtime (no deploy needed)

These have working defaults and only need setting in Railway if the practice wants to change them. All of them are read at boot, so changing one needs a service restart but not a code change or a release:

| Variable | Default | What it controls |
|---|---|---|
| `LOGIN_RATE_LIMIT_MAX` | `10` | Failed sign-ins allowed before the lockout |
| `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | `120` | The window those attempts are counted over |
| `OTP_RATE_LIMIT_MAX` | `5` | 2FA code attempts allowed — deliberately tighter, six digits is a small search space |
| `OTP_RATE_LIMIT_WINDOW_SECONDS` | `900` | The window for the above |
| `PASSWORD_RESET_RATE_LIMIT_MAX` | `5` | Reset links requestable per IP per `SIGNUP_RATE_LIMIT_WINDOW_SECONDS`. Not an enumeration control (the endpoint answers identically for an unknown address) — it stops our mail server being used to bombard an inbox. Leave it at the default in production; it exists as a setting so local/e2e runs can raise it |

**Note the rename**: `LOGIN_RATE_LIMIT_WINDOW_MINUTES` and `OTP_RATE_LIMIT_WINDOW_MINUTES` are gone, replaced by the `_SECONDS` variables above — the login window is now shorter than a minute's granularity can express. Any value still set for the old names is ignored, so remove them from Railway when deploying this change or the numbers will silently be the defaults rather than what the dashboard appears to say.

### Clinical escalation, and the address patients are given

These were **one variable until August 2026** and are now two. Read this before setting either, because the failure mode of getting it wrong is silent and patient-facing.

| Variable | Value | Who sees it |
|---|---|---|
| `ESCALATION_EMAIL` | `raheelmalik@me.com` | **Staff only.** Never rendered anywhere a patient can reach. |
| `CLINIC_CONTACT_EMAIL` | `clinical-team@aspireshield.com` | **Every patient, constantly** — the portal sidebar on every screen, the out-of-range card, and the footer of every Aspire summary PDF. |

`getClinicContact()` used to read `ESCALATION_EMAIL` for the patient-facing address, so one variable answered two unrelated questions: *where is a clinician paged* and *what address is a patient told to write to*. Those want different values — the first is a named person who is actually on duty, the second is a shared inbox that outlives whoever that is — and pointing the escalation at an individual, which is what a small practice actually wants, published that person's personal address to every patient and into every PDF already downloaded.

**Set both in Railway.** `ESCALATION_EMAIL` is the one that must be a person or a rota inbox someone genuinely reads; production now **refuses to boot** if it is empty or is not an address (`assertEscalationRoutable` in `lib/productionBootChecks.ts`). That check deliberately stops there: no code can tell whether a mailbox is monitored, and one that pretended to would be worse than none.

**What an escalation actually is.** After a report is released — and only then — `checkAndEscalate()` looks at every result on it. If any is `HIGH`, `LOW`, `SIGNIFICANT_HIGH` or `SIGNIFICANT_LOW`, one email goes to `ESCALATION_EMAIL`. Results never compared to a range are excluded, because a marker with no finding cannot be outside one. The severity is `SIGNIFICANT` if any result is significantly out, otherwise `MILD`.

**What is in the email, and it does contain patient-identifying detail.** Subject: `[Aspire Bloods] <urgency>: <patient name>`. Body: the patient's name, the report title, the sample date, the names of the flagged markers, and a link to the report in the admin portal. **No values, no ranges, no statuses.** The name is the patient's full name if a profile exists and their email address if not, so the body carries an identifier either way — this is an email to the treating practice about its own patient, which is what makes that appropriate, and it is the reason the address must be a mailbox the practice controls rather than a personal account on a consumer provider. Worth a decision in the DPIA (`docs/DPIA.md`), which flags it.

**SMS is different and deliberately barer.** Only if `SMS_ENABLED` and `ESCALATION_SMS_NUMBER` are both set. It is a ping — "review required for a released report" plus the link — with **no patient name and no marker names**, because a text message is read on a lock screen.

Every escalation writes an `EscalationEvent` row and an `ESCALATION_TRIGGERED` audit entry recording the severity, the marker count and which channels fired.

## Feature flags

### `VITE_BOOKING_ENABLED` — the patient-facing booking flow (Vercel, off)

| | |
|---|---|
| **Where** | Vercel, build time. Vite substitutes it into the bundle; it is not readable at runtime. |
| **Default** | Unset, which means off. Only the exact string `true` turns it on. |
| **Read in** | `apps/web/src/lib/features.ts`, once. Nothing else reads the variable directly. |

**Why it is off.** Booking moved to the clinic's main website, which now handles appointments. This portal is results only. The flow itself was finished and is not deleted, because turning it off is a product decision that could be reversed and because the parts underneath it are what the main site's booking will call.

**What off removes.** "Book a test" leaves the patient sidebar; `/book`, `/appointments`, `/appointments/:id` and `/appointments/:id/reschedule` redirect to `/overview` rather than 404ing (they are in bookmarks); Overview drops the upcoming-appointments section; an opened report drops its "from your appointment on…" provenance link; the fasting and preparation notices go with the flow that carried them. Rollup constant-folds the flag, so with it unset none of `features/booking` or `lib/booking` is in the production bundle at all — verified by grepping `dist/assets/*.js`.

**What off does NOT touch.** The server's Randox integration is a separate concern with a separate switch (`RANDOX_ENABLED`) and is untouched: ordering (`CreatePendingOrder`), `GetServiceLocations`, `AvailabilityDetails`, `HoldAvailabilityBooking`, `CreateRandoxBooking`, `CancelRandoxBooking`, the mock transport and every test over them all still run. Whatever implements booking on the main site calls those. **There is no reschedule endpoint** — the Postman collection has five booking calls and none of them moves an appointment — so moving one is hold-new, book-new, cancel-old, in that order, which is what `rescheduleBooking` does. Results ingestion, polling and the order lifecycle are likewise unaffected.

**Turning it back on.** Set `VITE_BOOKING_ENABLED=true` in Vercel (Production and/or Preview) and redeploy. Nothing else needs changing; no migration, no server variable. Two e2e expectations are written against "off" and would need updating with it: the patient sidebar's link count in `e2e/patient-sidebar.spec.ts`, and the "no booking entry point is reachable" test in `e2e/route-console.spec.ts`.

**Before it goes live on the main site**, read the note in `apps/web/src/lib/booking/README.md` about `findAppointmentForReport`: the report → appointment link needs Randox to carry the booking reference on the result payload, and the current implementation is a browser-local mock.

## Randox Nexus — going live

The integration is finished and runs end to end on the mock transport. Nothing is hardcoded: every value below is an environment variable read at boot, and the sandbox → production move is a set of Railway variables and a restart, with no code change and no release.

**The state it is in now.** `RANDOX_ENABLED=false` in production. With it false, nothing Randox-related runs at all — no polling job, no ordering endpoints, no config validation. Locally and on staging it runs with `RANDOX_ENABLED=true` and `RANDOX_TRANSPORT=mock`, which exercises the whole chain (create → poll → results → ingest → link → a report waiting for a clinician) against in-process fixtures.

**Two guards you will meet, and neither is to be worked around.** Booting production with `RANDOX_TRANSPORT=mock` and `RANDOX_ENABLED=true` is refused — the mock returns fixture results and they would be ingested as though they were a real patient's. Booting with `RANDOX_TRANSPORT=live` while `RANDOX_CODE_MAP_FILE` or `RANDOX_ID_MAP_FILE` still points at a checked-in `.example.json` is also refused: those files contain invented codes, and running live against them would classify every genuine Randox code as unrecognised and therefore as a void — which presents as "no results ever arrive" rather than as a configuration error. Both refusals name the variable.

### What is known and what is still missing (Aug 2026)

Both developer portal accounts are active, and four more documents are in `apps/server/src/modules/randox/specs/` — the CB STES auth document, the Nexus↔Clinic Booking flow diagram, and a Postman collection for each API.

**Known and already defaulted in code** — both base URLs, both B2C client ids, both scopes, the shared token endpoint, the two booking service ids (787 UK / 788 ROI), and the sandbox test location (30, Clinic Location Crumlin).

**Still missing, and each one blocks a live boot:**

| Missing | Where it comes from |
|---|---|
| The two subscription keys | Created in the developer portal, one per API |
| `RANDOX_USERNAME` / `RANDOX_PASSWORD` | **Also created in the portal**, not issued — both auth documents say "the username created within the Developer Portal", so nobody is waiting to send them |
| ~~`RANDOX_CLINIC_ID`~~ | **No longer needed (Aug 2026).** Fetched from `GET /Clinic/GetMyClinicDetails` on the boot sync and read back from the catalogue on a restart. Set it only to override. |
| Test and cancellation reason ids | Their own GET endpoints |
| The panel/test id map | Agreed with Randox, or mapped in the console |
| The collection methods | Whatever the contract permits |
| **The void and caveat code list** | **The Randox Web Developer team, and nothing else.** None of the four new documents contains it, and there is no endpoint in the OpenAPI spec that returns one. The boot guard stays. |

### What to do at go-live, in order

Everything in steps 1–9 is a Railway variable on the **API service** unless stated. Set them all, then restart once.

1. **Create the two subscription keys** in the Randox developer portal — one per API, they are not the same key. Set `RANDOX_NEXUS_SUBSCRIPTION_KEY` and `RANDOX_BOOKING_SUBSCRIPTION_KEY`. Example shape: `0f3c9a7e5b1d4e8fa2c6b0d9e4f71a35`.
2. **Create the ROPC service account in the developer portal** and set `RANDOX_USERNAME` and `RANDOX_PASSWORD`. Not something Randox send you: both auth documents say "This will be the username created within the Developer Portal". Both APIs share one pair by default; `RANDOX_NEXUS_USERNAME` / `RANDOX_NEXUS_PASSWORD` and the `RANDOX_BOOKING_*` equivalents exist only if production issues you separate accounts.
3. **Point at production rather than the sandbox.** The defaults are the `stes-` sandbox hosts. Set `RANDOX_NEXUS_BASE_URL` and `RANDOX_BOOKING_BASE_URL` to the production roots Randox give you. If production uses different B2C applications, also set `RANDOX_NEXUS_CLIENT_ID`, `RANDOX_BOOKING_CLIENT_ID`, `RANDOX_NEXUS_SCOPE`, `RANDOX_BOOKING_SCOPE` and `RANDOX_B2C_TOKEN_URL`; if not, leave all six on their documented defaults.
4. **Do nothing about the clinic id.** It is fetched from `GET /Clinic/GetMyClinicDetails` on the boot sync and read back out of the catalogue on a restart, because the flow diagram names that endpoint as the authority for it three times over — once each for GetOrderStatus, GetOrderResultReports and GetOrderResultDetail. `RANDOX_CLINIC_ID` still exists as an override for a support session and is no longer in the boot guard. **If the clinic has more than one test location**, that same call returns `clinicTestLocations` — set `RANDOX_TEST_CLINIC_LOCATION_ID` to the one you order against. That one stays a setting: the endpoint answers "which clinic are you" with a value and "which of your sites" with a list, and a list is a question rather than an answer. A single-site clinic leaves it blank and it falls back to the clinic id.
5. **Read the testing and cancellation reason ids** from `GET /TestReason/GetTestingReasons` and `GET /CancellationReason/GetCancellationReasons`, and set `RANDOX_DEFAULT_TEST_REASON_ID` (e.g. `1`) and `RANDOX_DEFAULT_CANCELLATION_REASON_ID` (e.g. `1`). Both are required — `CreatePendingOrder` rejects an empty `TestReasons`, and `CancelOrder` takes a reason id rather than free text.
6. **Fill in the void/caveat code map.** Ask Randox for their result-code list, copy `config/randox/result-codes.example.json` to `config/randox/result-codes.json`, fill it in, and set `RANDOX_CODE_MAP_FILE=./config/randox/result-codes.json`. Each entry is `{"kind": "VOID" | "CAVEAT", "description": "...", "patientSafeNote": "..."}`; leave `patientSafeNote` empty until you know what a caveat means to a patient. **A code that is not in this file voids the result**, deliberately — reporting a value whose caveat nobody can read is the worse failure. Codes Randox send that are not in the map are collected and shown on the **Ingestion log** page, so this list can be completed from real traffic.
7. **Fill in the panel/test id map.** Copy `config/randox/id-map.example.json` to `config/randox/id-map.json`, set `RANDOX_ID_MAP_FILE=./config/randox/id-map.json`, and put the agreed panel and test ids in it. Alternatively — and preferably — leave the file minimal and do this from the console instead: **Panels → Randox panel mapping → Refresh from Randox**, then pick our panel against each of theirs. That mapping is stored in the database, survives every refresh, records who set it, and takes precedence over the file. A panel with nothing mapped against it cannot be ordered; ordering refuses rather than sending a partial order.
8. **Say which collection routes you are contractually entitled to offer**: `RANDOX_COLLECTION_METHODS=IN_CLINIC,HOME_KIT,MOBILE_PHLEBOTOMY` — or whichever subset Randox have agreed. It is empty by default and an order requesting an unlisted method is refused before it is sent. Live boot with it empty is refused, because no order could be placed by any route.
9. **Switch the transport**: `RANDOX_TRANSPORT=live`, then `RANDOX_ENABLED=true`. Set them in that order, in one save if the dashboard allows it — `RANDOX_ENABLED=true` with `RANDOX_TRANSPORT=mock` is refused in production, so a partial save will fail the boot rather than ingest fixtures.
10. **Restart the service and read the boot log.** A missing or malformed setting fails the boot and names every one of them at once, with a sentence on what each is for. This is intentional: finding six missing credentials one redeploy at a time is its own kind of outage.
11. **Verify, in the console.** Open **Panels → Randox panel mapping** and press *Refresh from Randox* — that exercises all eight reference endpoints against the live gateway and will fail loudly if the key or the scope is wrong. Then place one real order and watch the **Ingestion log**. Polling is hourly per order, staggered by creation time, so the first status check is up to an hour after the order.

**If the first call 401s, check the scope before anything else.** The Nexus scope was wrong by one hyphen until Aug 2026 (`gptestorderportal-externalapi` for `gptestorderportal-external-api`) because it was transcribed from the auth PDF's rendered text, where the hyphen falls on a line break and vanishes — the CB scope is mangled the same way two paragraphs later in its own document. A wrong scope means B2C issues no token at all, so the failure arrives as a 401 talking about the token rather than about the scope. Copy scopes from the PDF's **link target** or from the Postman collection, never from the paragraph. Both credentials are required together — the bearer AND `Ocp-Apim-Subscription-Key` — which the CB auth document states outright, so a 401 is a wrong key, a wrong scope or a subscription not enabled for that product, and never a question of which one to send.

**For the first booking smoke test, use LocationId 30 ("Clinic Location Crumlin").** Randox confirm it has real availability; the Postman collection's own LocationId 15 may have none, and an empty diary is indistinguishable from a broken integration from the outside.

**Better: run the whole flow in one command.** `npm run sandbox:pass --workspace=apps/server` walks CreatePendingOrder → GetServiceLocations → AvailabilityDetails → Hold → CreateRandoxBooking → GetOrderStatus (1→4) → both result endpoints → CancelRandoxBooking against the sandbox, writes every response body verbatim to `apps/server/src/modules/randox/specs/sandbox-responses/`, and answers the seven open integration questions in `ANSWERS.md`. It refuses to run against a non-`stes-` host or under `NODE_ENV=production`, and it sends an invented patient. **The Nexus half has been run (14 Aug 2026)** — order `AWL002-00163606`, clinic 1298, and questions 1 and 2 answered from evidence. The Clinic Booking half has not, for want of that key. A rerun clears the directory first, so it always holds exactly one run. See its README.

**It is standalone and needs THREE variables**, none of them the server's: `RANDOX_NEXUS_SUBSCRIPTION_KEY`, `RANDOX_USERNAME` and `RANDOX_PASSWORD`. Copy `apps/server/.env.sandbox.example` to `apps/server/.env.sandbox` (gitignored) and fill those three in. It does not read `config/env.ts`, so it wants no `DATABASE_URL`, no JWT secrets, no `ENCRYPTION_KEY`, no `FILE_SIGNING_SECRET` and no app URLs — it calls an external API and writes files — and it does not need `RANDOX_ENABLED` or `RANDOX_TRANSPORT` either, which are the server's switches. A missing credential is refused by name before any call is made.

**The Clinic Booking half is optional.** `RANDOX_BOOKING_SUBSCRIPTION_KEY` comes from a different developer portal, and booking is out of this portal's scope. Leave it unset and the Nexus flow runs alone, with `ANSWERS.md` recording that questions 4–7 went **unasked and why** rather than failing the run — "we did not ask" and "we asked and learned nothing" are different results and are written down differently.

### The variables, in full

| Variable | Example | Notes |
|---|---|---|
| `RANDOX_ENABLED` | `true` | Master switch. False means none of this runs. |
| `RANDOX_TRANSPORT` | `live` | `mock` runs against fixtures; refused in production with `RANDOX_ENABLED=true`. |
| `RANDOX_NEXUS_BASE_URL` | `https://gpto-appapi-001-apim.azure-api.net/api/` | Defaults to the `stes-` sandbox. |
| `RANDOX_BOOKING_BASE_URL` | `https://cb-platform-apim.azure-api.net/booking-platform-api/` | Defaults to the `stes-` sandbox. |
| `RANDOX_NEXUS_SUBSCRIPTION_KEY` | `0f3c9a7e…` | **Not issued yet.** Required for live. |
| `RANDOX_BOOKING_SUBSCRIPTION_KEY` | `7b2e4d1c…` | **Not issued yet.** Different key from the above. |
| `RANDOX_USERNAME` / `RANDOX_PASSWORD` | `aspire-api@…onmicrosoft.com` | ROPC service account. Per-API overrides exist and are usually unnecessary. |
| `RANDOX_NEXUS_CLIENT_ID` | `791f0001-20d7-4771-b4ab-359b4b9efd21` | Documented, not secret. Defaulted. |
| `RANDOX_BOOKING_CLIENT_ID` | `0b0399a4-d61f-43fc-a0d0-3311f60cdcb1` | Documented, not secret. Defaulted. |
| `RANDOX_NEXUS_SCOPE` / `RANDOX_BOOKING_SCOPE` | `https://randoxclinicbooking.onmicrosoft.com/…` | From the STES auth documents **and both Postman collections**. Defaulted. Note the hyphen in `gptestorderportal-external-api` — see the 401 note above. |
| `RANDOX_BOOKING_SERVICE_ID_UK` / `_ROI` | `787` / `788` | The ServiceId for third-party in-clinic bookings. Exactly two exist. Defaulted. |
| `RANDOX_BOOKING_REGION` | `UK` | Picks between the two above. A deployment fact, not a per-request one. |
| `RANDOX_B2C_TOKEN_URL` | `https://randoxclinicbooking.b2clogin.com/…/oauth2/v2.0/token` | One shared endpoint; per-API overrides exist. |
| `RANDOX_CLINIC_ID` | *(leave unset)* | **Override only.** Fetched from `GetMyClinicDetails` and cached in the catalogue. Set it to pin the value during a support session. |
| `RANDOX_TEST_CLINIC_LOCATION_ID` | `147` | Blank falls back to the clinic id. |
| `RANDOX_DEFAULT_TEST_REASON_ID` | `1` | From `GetTestingReasons`. Required. |
| `RANDOX_DEFAULT_TEST_REASON_DETAILS` | `Private health screening requested by the patient.` | Free text sent with it. |
| `RANDOX_DEFAULT_CANCELLATION_REASON_ID` | `1` | From `GetCancellationReasons`. Required. |
| `RANDOX_COLLECTION_METHODS` | `IN_CLINIC` | Comma-separated. Empty is refused on a live boot. |
| `RANDOX_CODE_MAP_FILE` | `./config/randox/result-codes.json` | An `.example.json` path is refused on a live boot. |
| `RANDOX_ID_MAP_FILE` | `./config/randox/id-map.json` | Same. Database mappings take precedence. |
| `RANDOX_HEALTH_CHECK_PANEL_REPORT` | `true` | Asks for the patient-facing scalebar PDF rather than the tabular lab one. |
| `RANDOX_CV_SCORE_REQUIRED` | `false` | Needs measurements `CreatePendingOrder` cannot carry. Leave off. |
| `RANDOX_REFERENCE_DATA_METHOD` | `get` | Settled by the OpenAPI spec: all eight reference endpoints are GET (takes a body → POST; takes nothing → GET). `auto` survives as an escape hatch — it sends the declared verb and repeats as POST on a 404/405/501. |
| `RANDOX_BEARER_TOKEN_ENABLED` | `true` | **Confirmed required (Aug 2026)** — the CB auth document: "Authorisation will be the bearer token and in the header section include the following key: Ocp-Apim-Subscription-Key." Both, on every request. Leave it on; turning it off is a diagnostic step for an unexplained 401, not a configuration. The key always goes, in the header. |
| `RANDOX_MAX_REQUESTS_PER_MINUTE` | `60` | Outbound pacing, **per API**. Randox's documented limit is **600/min per API** and the boot refuses anything above it. 60 is a tenth of the ceiling on purpose — 600 is where they start refusing. `0` disables our pacing; a gateway `Retry-After` is obeyed regardless. |
| `RANDOX_RETRY_MAX_ATTEMPTS` | `3` | Transient failures only (429, 5xx, timeout). Never applied to `CreatePendingOrder`. |
| `RANDOX_RETRY_BASE_DELAY_MS` | `500` | Exponential with jitter from here, capped at 60s. |
| `RANDOX_POLL_CRON` | `*/5 * * * *` | How often the sweeper wakes, **not** how often an order is polled. |
| `RANDOX_POLL_INTERVAL_MINUTES` | `60` | Per order, staggered by its creation minute. Randox ask for hourly. |
| `RANDOX_POLL_BATCH_SIZE` | `25` | Orders per sweep, so a backlog spreads rather than bursting. |
| `RANDOX_POLL_MAX_FAILURES` | `12` | After this many consecutive failures an order stops being polled and waits for an admin. It is never lost. |

### What happens to a result once it arrives

Worth knowing before you turn it on, because most of it needs nobody:

- The order number Randox return is the reference we created the order under, so the result attaches itself to that patient. Before it does, the name and date of birth are checked against the account — against what Randox echo back where they supply it, and against what the order was placed under. Anything that disagrees is **not** linked; it goes to **Result linking** with the disagreement named.
- A clean parse advances the report to admin-verified on its own. Anything ambiguous — a marker we could not file, a missing or one-sided reference range, a disagreement with Randox's own high/low flag, a lab that has not finished — stops at parsed and says why in the ingestion log.
- **A CLEAN DELIVERY AUTO-RELEASES (changed Aug 2026).** A patient sees a report as soon as it has been ingested and parsed cleanly, with no human step. What the state machine still enforces server-side is that `release` is only reachable from `PARSED` — nothing unread or sent-back can reach anybody — and that **a report carrying hold reasons cannot be released by anything until a person acknowledges them**. That refusal is the only checkpoint in the pipeline, so the exception queue on the work queue screen is the thing to keep an eye on after a deploy.
- **Out-of-range escalation now fires BEFORE the release lands**, to `ESCALATION_EMAIL`, and a significantly out-of-range result is louder than a mildly out-of-range one (subject, priority headers, and the two groups listed separately). Check that address is a mailbox somebody reads: with no clinician gate it is the only thing that tells the practice a result went out.

## Deploy process

Both Railway and Vercel auto-deploy on push to `main` once connected to the GitHub repo. Branch protection means that only happens via a merged, CI-passed PR. The CI workflow (`typecheck` → `lint` → `test` → `build`, all four required) runs on every PR and push to `main`; GitHub branch protection is what actually makes it block merges — see the branch protection step above.

## Rollback

- **Railway**: Service → Deployments → find the last known-good deployment → **Redeploy**. Because migrations run via `prisma migrate deploy` in the start command, rolling back the *code* does not roll back the *schema* — if the bad deploy included a migration, you need to also restore the database (see below) or write a compensating migration, not just redeploy old code against a newer schema.
- **Vercel**: Project → Deployments → find the last known-good deployment → **Promote to Production**. Instant, no build step (it's already built).

## Database restore

Backups run as a Railway **Cron Service** (`apps/server/backup.Dockerfile` + `apps/server/scripts/backup.sh`, set up in the Railway section above), not a GitHub Action — the earlier GitHub Actions version needed Railway Postgres's connection string to be **publicly** reachable, since GitHub's runners are outside Railway's private network; running the same job as a Railway service instead means it can use the **private** `DATABASE_URL` (Railway's internal networking) and Postgres never needs to be exposed to the internet at all.

Nightly at 03:15 UTC: `pg_dump`, gzip-compressed, uploaded to S3-compatible off-platform storage (Cloudflare R2 recommended: free egress, generous free tier, S3-compatible API). Retention: **35 days**, pruned automatically by the same script. This is deliberately separate from whatever backup tier Railway's own Postgres plan includes — a Railway-only backup doesn't help if the incident is Railway itself (account issue, region outage, accidental project deletion). The script fails loudly (non-zero exit, explicit message) rather than silently skipping if `DATABASE_URL` or any `BACKUP_S3_*` variable is missing.

Built and ran this exact image locally before committing it: real `pg_dump` against the local Postgres, real upload/list/delete against a local MinIO instance standing in for R2 — confirmed the dump, the upload, and both branches of the prune logic (kept a recent backup, deleted an artificially-expired one) all actually work, not just that the script reads correctly.

> ## ⚠ 12 AUGUST 2026 — THE SERVICE NOW EXISTS AND ITS FIRST RUN FAILED
>
> Standing it up found a second fault behind the first. The service is
> deployed, the schedule is set, the variables are in place, and the first run
> stopped at the DUMP stage on a **Postgres version mismatch**: Railway's
> Postgres is 18.4 and the image was pinned at `postgres:16-alpine`, and
> `pg_dump` refuses to dump a server newer than itself. Fixed by bumping the
> image to 18 — see [The client major version](#the-client-major-version-must-be-at-least-the-servers)
> for the failure, why it was safe, and what to do the next time Railway
> upgrades.
>
> **The bucket was still 0 bytes at that point.** Before this, there was no
> backup service in the Railway project at all — only the API and Postgres —
> while the Dockerfile and the script sat in the repository for months with
> nothing deploying or scheduling them.
>
> Until a run has both succeeded and been drilled, treat the practice as having
> no off-platform backup. Take the manual backup at the end of this section
> now, so at least one copy exists, then redeploy the backup service and work
> through step 5 and step 6 below.

### What was missing, exactly

Four things, and only the first was a file:

| | Existed? | |
| --- | --- | --- |
| `apps/server/backup.Dockerfile` | ✅ | builds an image with `pg_dump` + AWS CLI |
| `apps/server/scripts/backup.sh` | ✅ | dumps, verifies, uploads, prunes |
| **A Railway service that builds that Dockerfile** | ❌ | nothing pointed at it |
| **A cron schedule on that service** | ❌ | nothing ran it |
| **Environment variables on that service** | ❌ | no `BACKUP_S3_*` anywhere |
| **Anything that notices it is not running** | ❌ | the failure was silent for months |

The last row is the one that mattered. A backup job's real failure mode is
being absent, and absence produces no logs, no errors and no alerts. Three
things now close it: the job **writes a `BackupRun` row** to the database on
every run whatever the outcome, the **clinician work queue leads with the last
successful backup** and says so plainly when there has never been one, and the
job **emails `ESCALATION_EMAIL`** on failure and on a dump that is suspiciously
small against the previous night's.

### Standing up the backup cron service

`railway.backup.json` at the repository root carries the build and the
schedule. Everything below is what Railway needs that a file cannot supply.

**Step 1 — create the service.**

1. Open the Railway project.
2. Press **+ New** (top right) → **GitHub Repo** → choose **`Ibio9/aspire-bloods`**.
3. Railway creates a service and immediately starts building the wrong thing
   (it defaults to the root `railway.json`, which is the API). That is expected;
   the next step fixes it. Let it fail or cancel it.
4. Click the new service → **Settings** → **General** → rename it to
   **`backup`** so it is not "aspire-bloods (1)" in six months.

**Step 2 — point it at the right config.**

1. Still in **Settings**, find **Config-as-code** (under *Build*).
2. In **Railway Config File**, paste exactly: `railway.backup.json`
3. Press **Save**. This is what selects `apps/server/backup.Dockerfile`, the
   `/backup.sh` start command, the `15 3 * * *` schedule and
   `restartPolicyType: NEVER`. **Do not** also set a Dockerfile path or a start
   command in the dashboard — two sources for one setting is one edit away from
   disagreeing.

**Step 3 — the cron schedule.**

Confirm it took: **Settings → Deploy → Cron Schedule** should read `15 3 * * *`.
If the field is empty, type it there. That is 03:15 UTC daily. Railway runs a
cron service **to completion** on that schedule rather than keeping it up, so it
is billed for the ~40 seconds it takes.

**Step 4 — the environment variables.** Service → **Variables** tab.

`DATABASE_URL` is added differently from the rest and this is the whole reason
the backup is a Railway service rather than a GitHub Action:

1. Press **+ New Variable** → **Add Reference** (not the plain text field).
2. Choose the **Postgres** service → **`DATABASE_URL`**.
3. Confirm the value shown contains **`.railway.internal`**. If it says
   `containers-us-west-…` or any public host, you have picked the public URL:
   remove it and pick again. The private one means Postgres never needs a public
   network exposure for backups to work.

The rest are plain values. Press **+ New Variable** for each, or use **Raw
Editor** and paste the block below with your own values filled in:

| Variable | What it is | Where it comes from |
| --- | --- | --- |
| `DATABASE_URL` | the database to dump | **Add Reference** → Postgres → `DATABASE_URL` (private) |
| `BACKUP_S3_ACCESS_KEY_ID` | R2 access key id | Cloudflare → R2 → **Manage R2 API Tokens** → the token's Access Key ID |
| `BACKUP_S3_SECRET_ACCESS_KEY` | R2 secret | same token — **shown once**, at creation |
| `BACKUP_S3_ENDPOINT` | R2 S3 endpoint | Cloudflare → R2 → bucket → **Settings** → S3 API. Looks like `https://<account-id>.r2.cloudflarestorage.com`. **No bucket name on the end** |
| `BACKUP_S3_BUCKET` | the bucket | `aspire-bloods-backups` |
| `RESEND_API_KEY` | so failures can email | the same key the API service already has — copy it across |
| `ESCALATION_EMAIL` | who gets told | the same value the API service has. **Staff only** — never `CLINIC_CONTACT_EMAIL`, which is what patients see |
| `EMAIL_FROM` | the sender | same as the API service. Optional; defaults to `Aspire Clinic <no-reply@aspireshield.com>` |
| `BACKUP_RETENTION_DAYS` | how long to keep | optional, defaults to `35`. Leave unset |
| `BACKUP_S3_REGION` | R2 ignores it, the CLI insists | optional, defaults to `auto`. Leave unset |
| `BACKUP_MIN_UNCOMPRESSED_BYTES` | the "is this empty" floor | optional, defaults to `262144`. Leave unset |
| `BACKUP_SHRINK_ALERT_PERCENT` | alert if under this % of last night | optional, defaults to `60`. Leave unset |

The R2 API token needs **Object Read & Write** on this bucket. Read alone
cannot upload; admin is more than it needs.

**Step 5 — run it once, now, rather than waiting for 03:15.**

1. Service → **Deployments** tab → the latest deployment → **⋮** → **Redeploy**.
   On a cron service this runs the job immediately.
2. Watch the logs. A good run prints, in order: `Dumping database…`,
   `Verifying the dump…`, `Dump verified: N bytes…`, `Uploading to s3://…`,
   `Reading the object back…`, `Uploaded and verified…`, `Backup job complete.`
3. Any failure prints a sentence naming the stage and emails
   `ESCALATION_EMAIL`. The commonest is `BACKUP_S3_ENDPOINT` with the bucket
   name accidentally appended.

**Step 6 — confirm it from three places, not one.**

1. Cloudflare → R2 → the bucket. There is an object named
   `aspire-bloods-<timestamp>.sql.gz` and the bucket is no longer 0 B.
2. The portal → **Clinician console → Work queue**. The first band reads
   **"under an hour ago — last successful backup"**.
3. Run the restore drill below against that object. Until it has been restored
   once, it is a file, not a backup.

### Take a manual backup right now (PowerShell)

Do this today, before the service exists. It needs **Docker Desktop running** —
that is where `pg_dump` comes from, so nothing has to be installed.

You need the **public** `DATABASE_URL`: Railway → Postgres service → **Variables**
→ `DATABASE_PUBLIC_URL` (the `.proxy.rlwy.net` one, *not* `.railway.internal` —
your laptop is outside Railway's private network).

**Use a client image at least as new as the server** — `postgres:18-alpine`
below, because Railway's Postgres is 18.4. See the note under
[The client major version](#the-client-major-version-must-be-at-least-the-servers);
`postgres:16-alpine` fails outright against it.

```powershell
# 1. Paste the public connection string. It stays in this shell only.
$env:PGURL = "postgresql://postgres:PASSWORD@HOST.proxy.rlwy.net:PORT/railway"

# 2. Where to put it, and a name with the moment in it.
$stamp  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH-mm-ssZ")
$outDir = "$env:USERPROFILE\aspire-backups"
New-Item -ItemType Directory -Force $outDir | Out-Null
$out = Join-Path $outDir "aspire-bloods-$stamp.sql"

# 3. Dump it, using the same Postgres 18 client the backup image uses.
#    The client major must be >= the server's or pg_dump refuses outright.
#    --no-owner --no-privileges so it restores into a database with different
#    role names, which a scratch database always has.
docker run --rm -e PGURL=$env:PGURL postgres:18-alpine `
  sh -c 'pg_dump "$PGURL" --format=plain --no-owner --no-privileges' | Set-Content -Path $out -Encoding utf8

# 4. Look at it before believing it. A dump that failed is often a small file
#    that exists, which is why this checks the size AND the content.
$size = (Get-Item $out).Length
"{0:N0} bytes" -f $size
if ($size -lt 262144) { Write-Error "That is too small to be this database. Do not trust it." }
Select-String -Path $out -Pattern '^COPY public\."(Report|ReportResult|User)"' | Select-Object -First 3
```

Those last two lines are the point. **A `pg_dump` that fails still leaves a
file**, and a 4 kB file of error text looks like a backup in a folder listing.
The size floor and the three `COPY` sections are the same two checks the nightly
job makes.

Then compress it and put it somewhere that is not this laptop:

```powershell
Compress-Archive -Path $out -DestinationPath "$out.zip"
Get-FileHash "$out.zip" -Algorithm SHA256
```

Keep the hash. If you later upload this to R2 by hand, compare it after.

**It contains every patient record in the database.** Encrypted-at-rest fields
stay encrypted inside the dump; everything else — names, dates of birth, contact
details, results — does not. It belongs on an encrypted disk, and it should be
deleted once the scheduled backups are confirmed working.

### The client major version must be at least the server's

**This is what broke the first real run of the backup, on 12 August 2026.**

```
Dumping database...
pg_dump: error: aborting because of server version mismatch
pg_dump: detail: server version: 18.4 (Debian 18.4-1.pgdg13+1);
         pg_dump version: 16.14
pg_dump failed, or the compressed stream was truncated. Nothing was uploaded.
```

`pg_dump` refuses to dump a server whose major version is newer than its own.
It is not a warning and there is no flag for it. Railway's Postgres is **18.4**;
`backup.Dockerfile` was pinned at `postgres:16-alpine`, so every run would have
failed exactly this way.

**The pin follows Railway's Postgres, not `docker-compose.yml`.** The local
development database (still 16) is not the database this container dumps, and
the two are free to diverge. Newer than the server is fine and is the intended
direction — `pg_dump` supports servers back to 9.2, so a client ahead costs
nothing and a client behind costs the backup.

**The failure was safe, and that is worth knowing before anybody simplifies the
script.** `set -o pipefail` is what made it safe: `pg_dump | gzip` exits with
*gzip's* status, and gzip compresses an empty stream into a perfectly valid
20-byte `.gz` without complaint. Without `pipefail` this run would have uploaded
that file, recorded `SUCCEEDED`, and the work queue would have shown a green
backup band over an empty archive. Instead the job stopped at the DUMP stage,
uploaded nothing, wrote a `FAILED` row and emailed. Do not remove that line.

**When Railway upgrades Postgres again**, `backup.sh` now reads both versions at
the start of every run (`STAGE="VERSION"`) and fails with both numbers and the
fix named, rather than leaving it to a comment nobody reads. On that alert:
change the `FROM` line in `apps/server/backup.Dockerfile` to
`postgres:<server major>-alpine` and redeploy the backup service. The same
applies to the manual PowerShell backup above and to any machine you run
`scripts/restore-drill.sh` from.

### What the nightly job verifies before it calls a file a backup

An untested backup is not a backup, and half of that test can be done every night by the same container that takes the dump. `scripts/backup.sh` does all of this and **exits non-zero rather than uploading** if any of it fails:

0. **The client is not older than the server.** Read from the server itself
   (`server_version_num`) and from `pg_dump --version`, before anything is
   dumped, so an image that cannot possibly work says so with both numbers
   rather than producing a stack trace at 3am. See the section above.
1. **`set -o pipefail`.** `pg_dump | gzip` exits with *gzip's* status, and gzip will happily compress a truncated stream — so without this a `pg_dump` that died halfway produces a valid `.gz` containing half a database and the script exits 0. That is the exact shape of "we had backups for eight months and none of them restored".
2. **`gzip -t`.** The archive decompresses. Catches truncation and corruption, which is what a killed container or a full `/tmp` produces.
3. **A size floor and a schema check.** The uncompressed dump is above `BACKUP_MIN_UNCOMPRESSED_BYTES` (256 kB default) and contains `COPY public."Report"`, `"ReportResult"` and `"User"` data sections. A dump taken against an empty database, with the wrong `DATABASE_URL`, or by a role with no read permission on the public schema, is a small perfectly-valid gzip in every one of those cases.
4. **A round-trip hash.** The object is downloaded again from R2 and its SHA-256 compared with what was sent. `aws s3 cp` exiting 0 says the CLI finished, not that the bytes on somebody else's system are the bytes that left here — and the whole point of an off-platform backup is that the other side is somebody else's system.

What it deliberately does **not** do is restore the dump: that needs a Postgres *server* and this image has only the client tools. That is the drill below.

### The restore drill — run it, don't assume it

`apps/server/scripts/restore-drill.sh`. Restores a real backup into a scratch database, compares **every** table's row count against a live source, and hashes one released report end to end. Run it **quarterly, and after any schema migration that rewrites data**.

You need `psql`, `pg_dump`, `gzip` and (for `--from-s3`) the AWS CLI on the machine you run it from.

```bash
# 1. Get a shell somewhere that can reach both the database and R2. A Railway
#    service shell works; so does a laptop with the public connection string.

# 2. List what is actually in the bucket. If this is empty, there has never
#    been a backup — say so plainly rather than assuming the job is fine.
export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto
aws s3 ls "s3://$BACKUP_S3_BUCKET/" --endpoint-url "$BACKUP_S3_ENDPOINT"

# 3. Drill the most recent one into a scratch database.
export SOURCE_URL="$DATABASE_URL"                      # what to compare against
export SCRATCH_URL="postgresql://user:pass@host:5432/aspire_restore_drill"
cd apps/server
./scripts/restore-drill.sh --from-s3 aspire-bloods-2026-08-12T03-15-00Z.sql.gz
```

It prints a table-by-table comparison and ends with `PASSED` or `FAILED`, and exits non-zero on failure so it can be run from cron if you ever want to.

**The guard.** The script DROPS and recreates whatever `SCRATCH_URL` points at, so it refuses to run unless that database's name contains `drill` or `scratch`. It is a name check rather than a host check on purpose: a scratch database on the production server is a perfectly legitimate place to drill, and a database called `aspire_bloods` is never a legitimate place to restore over, wherever it lives.

**`ON_ERROR_STOP=1` is the whole point of the restore line.** Without it `psql` prints errors, carries on, and exits 0 — which is a half-restored database reported as a successful restore.

Other forms:

```bash
./scripts/restore-drill.sh --dump-file ./some-backup.sql.gz   # a file you already have
./scripts/restore-drill.sh                                    # takes a fresh dump of SOURCE_URL
```

The last form drills the mechanism rather than a stored backup, and is what to run locally against `docker compose` before trusting the script in anger.

**Verified locally, 12 August 2026**, against the development database (Postgres 16, `docker compose`): dump taken, `gzip -t` clean, restored into `aspire_restore_drill` with `ON_ERROR_STOP=1`, **41 tables compared, 0 mismatched** (including `AuditLogEntry` 5,739, `ResultReferenceRange` 3,080, `ReportResult` 2,928, `User` 540, `Report` 138), and the most recent released report's 12 results identical by MD5 over their encrypted values and statuses.

### Restoring for real

```bash
gunzip -c aspire-bloods-<timestamp>.sql.gz | psql "<target DATABASE_URL>" -v ON_ERROR_STOP=1
```

Restoring into a **new** empty database and re-pointing `DATABASE_URL` (rather than restoring over the live one) is the safer default unless you specifically intend to discard everything written since the backup.

**Retention is 35 days** (`BACKUP_RETENTION_DAYS`, pruned by the same script). That matches PRIVACY.md §5, which records the consequence a patient has to be able to be told about — *an erasure carried out today remains present in every backup taken before it until those backups age out* — and PRIVACY.md §7, which lists R2 as holding a full `pg_dump` for 35 days. Change one and change all three.

**You need to do, once, before backups start working**: create the R2 (or S3) bucket and an access key pair, then add the `BACKUP_S3_*` variables on the Railway backup cron service (Railway section, step above). Until those exist, the cron job will fail loudly every night (by design) instead of pretending backups are happening — check that service's logs after the first scheduled run.

⚠ **Whether a backup has ever actually been taken cannot be established from this repository.** It requires listing the R2 bucket with live credentials, which nothing in the checkout has. The `aws s3 ls` in step 2 above is the check; run it before assuming the schedule is working, and treat an empty listing as "there are no backups", not as a tooling problem.

## Post-deploy smoke checklist

Run through this after the first production deploy, and after any deploy that touches auth, storage, or the release pipeline:

- [ ] Sign up a fresh patient account, complete profile + consents. **Exactly ONE emailed code** — registration confirms the address and signs you in on that one code (Aug 2026); a second code on a second screen is the bug this replaced
- [ ] Sign out and log in again: confirm mandatory 2FA still fires (OTP email actually arrives — this also confirms `RESEND_API_KEY` is real and working, and that registration's single code did not quietly relax the second factor)
- [ ] Admin: upload a PDF report for that patient, verify the parsed rows, release it through to `RELEASED`
- [ ] Admin: create a manual-entry report for the same patient on a different date, same marker, confirm it also releases
- [ ] Patient: see both reports, open the marker detail page, confirm the trend graph renders with both points and the reference band
- [ ] Patient: download the original PDF and the Aspire summary PDF — confirms signed file URLs work with the volume-backed storage
- [ ] Trigger an out-of-range result (manual entry with a value outside the reference range) and confirm the escalation email fires
- [ ] **Test login in Safari specifically** — this is the one browser that's historically strictest about third-party cookies, so it's the real test of whether `COOKIE_DOMAIN` is actually working. Log in, refresh the page, confirm the session persists (not silently logged out).
- [ ] Confirm `admin@<practice-admin-email>` has the ADMIN role and a non-admin account does not (checks `ADMIN_EMAILS` took effect)
- [ ] Check Railway logs for the first few minutes of traffic — confirm no patient email addresses, names, or clinical values appear anywhere in the log output
- [ ] **List the backup bucket** (`aws s3 ls`, see Database restore) and confirm last night's dump is there. An empty listing means backups have never run — not that the command is wrong.
- [ ] **Run the restore drill** (`scripts/restore-drill.sh --from-s3 <newest key>`) into a scratch database and confirm it prints `PASSED`

## What I could not do myself

- Creating the GitHub repo, pushing to it, and configuring branch protection (no `gh` CLI or GitHub credentials in this environment)
- Creating the Railway project/services (including the backup cron service), setting environment variables, generating domains, creating the volume
- Creating the Vercel project, setting environment variables, adding the domain
- Adding the IONOS DNS records
- Creating an R2/S3 bucket and access keys for backups, and adding the `BACKUP_S3_*` variables on the Railway backup service
- Verifying DNS propagation, certificate issuance, and the Safari cookie behavior in production — all of this needs the real domains to exist first

Everything else — the code changes needed to make the split topology, cookie domain, CORS, migration-gated deploys, persistent rate limiting, and PDF storage all actually work — is done and committed.
