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

- [ ] **Add a third service** for the nightly backup → same GitHub repo, but set it to build `apps/server/backup.Dockerfile` (Settings → Source → this repo, then Settings → Build → set the Dockerfile path) — **not** the app's own `Dockerfile`; this one only needs `pg_dump` and the AWS CLI, not Node. Service → **Settings → Cron Schedule**, set `15 3 * * *` (03:15 UTC daily). This makes it a cron service: Railway runs the container to completion on that schedule instead of keeping it always-on, so it isn't billed as a running service between backups.
  - Variables:
    - `DATABASE_URL` — use the **private** reference to the Postgres service (Railway's internal networking, e.g. `postgres.railway.internal`), the same "Add Reference" picker as the API service uses. This is the whole point of running the backup as a Railway service instead of a GitHub Action: Postgres never needs a public network exposure for backups to work.
    - `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET` — see "Backups" below for where these come from (R2 bucket + API token)
    - `BACKUP_RETENTION_DAYS=35` (optional — this is already the default if unset)

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

**What off does NOT touch.** The server's Randox integration is a separate concern with a separate switch (`RANDOX_ENABLED`) and is untouched: ordering (`CreatePendingOrder`), `GetServiceLocations`, `AvailabilityDetails`, `HoldAvailabilityBooking`, `CreateRandoxBooking`, cancel/reschedule, the mock transport and every test over them all still run. Whatever implements booking on the main site calls those. Results ingestion, polling and the order lifecycle are likewise unaffected.

**Turning it back on.** Set `VITE_BOOKING_ENABLED=true` in Vercel (Production and/or Preview) and redeploy. Nothing else needs changing; no migration, no server variable. Two e2e expectations are written against "off" and would need updating with it: the patient sidebar's link count in `e2e/patient-sidebar.spec.ts`, and the "no booking entry point is reachable" test in `e2e/route-console.spec.ts`.

**Before it goes live on the main site**, read the note in `apps/web/src/lib/booking/README.md` about `findAppointmentForReport`: the report → appointment link needs Randox to carry the booking reference on the result payload, and the current implementation is a browser-local mock.

## Randox Nexus — going live

The integration is finished and runs end to end on the mock transport. Nothing is hardcoded: every value below is an environment variable read at boot, and the sandbox → production move is a set of Railway variables and a restart, with no code change and no release.

**The state it is in now.** `RANDOX_ENABLED=false` in production. With it false, nothing Randox-related runs at all — no polling job, no ordering endpoints, no config validation. Locally and on staging it runs with `RANDOX_ENABLED=true` and `RANDOX_TRANSPORT=mock`, which exercises the whole chain (create → poll → results → ingest → link → a report waiting for a clinician) against in-process fixtures.

**Two guards you will meet, and neither is to be worked around.** Booting production with `RANDOX_TRANSPORT=mock` and `RANDOX_ENABLED=true` is refused — the mock returns fixture results and they would be ingested as though they were a real patient's. Booting with `RANDOX_TRANSPORT=live` while `RANDOX_CODE_MAP_FILE` or `RANDOX_ID_MAP_FILE` still points at a checked-in `.example.json` is also refused: those files contain invented codes, and running live against them would classify every genuine Randox code as unrecognised and therefore as a void — which presents as "no results ever arrive" rather than as a configuration error. Both refusals name the variable.

### What to do at go-live, in order

Everything in steps 1–9 is a Railway variable on the **API service** unless stated. Set them all, then restart once.

1. **Get the two subscription keys** from the Randox developer portal — one per API, they are not the same key. Set `RANDOX_NEXUS_SUBSCRIPTION_KEY` and `RANDOX_BOOKING_SUBSCRIPTION_KEY`. Example shape: `0f3c9a7e5b1d4e8fa2c6b0d9e4f71a35`.
2. **Get the ROPC service account** Randox issue for the password grant and set `RANDOX_USERNAME` and `RANDOX_PASSWORD` (e.g. `aspire-api@randoxclinicbooking.onmicrosoft.com`). Both APIs share one pair by default; `RANDOX_NEXUS_USERNAME` / `RANDOX_NEXUS_PASSWORD` and the `RANDOX_BOOKING_*` equivalents exist only if production issues you separate accounts.
3. **Point at production rather than the sandbox.** The defaults are the `stes-` sandbox hosts. Set `RANDOX_NEXUS_BASE_URL` and `RANDOX_BOOKING_BASE_URL` to the production roots Randox give you. If production uses different B2C applications, also set `RANDOX_NEXUS_CLIENT_ID`, `RANDOX_BOOKING_CLIENT_ID`, `RANDOX_NEXUS_SCOPE`, `RANDOX_BOOKING_SCOPE` and `RANDOX_B2C_TOKEN_URL`; if not, leave all six on their documented defaults.
4. **Read your own clinic id** from `GET /Clinic/GetMyClinicDetails` (it returns an integer, e.g. `146`) and set `RANDOX_CLINIC_ID=146`. If the clinic has more than one test location, that call also returns `clinicTestLocations` — set `RANDOX_TEST_CLINIC_LOCATION_ID` to the one you order against. A single-site clinic leaves it blank and it falls back to the clinic id.
5. **Read the testing and cancellation reason ids** from `GET /TestReason/GetTestingReasons` and `GET /CancellationReason/GetCancellationReasons`, and set `RANDOX_DEFAULT_TEST_REASON_ID` (e.g. `1`) and `RANDOX_DEFAULT_CANCELLATION_REASON_ID` (e.g. `1`). Both are required — `CreatePendingOrder` rejects an empty `TestReasons`, and `CancelOrder` takes a reason id rather than free text.
6. **Fill in the void/caveat code map.** Ask Randox for their result-code list, copy `config/randox/result-codes.example.json` to `config/randox/result-codes.json`, fill it in, and set `RANDOX_CODE_MAP_FILE=./config/randox/result-codes.json`. Each entry is `{"kind": "VOID" | "CAVEAT", "description": "...", "patientSafeNote": "..."}`; leave `patientSafeNote` empty until you know what a caveat means to a patient. **A code that is not in this file voids the result**, deliberately — reporting a value whose caveat nobody can read is the worse failure. Codes Randox send that are not in the map are collected and shown on the **Ingestion log** page, so this list can be completed from real traffic.
7. **Fill in the panel/test id map.** Copy `config/randox/id-map.example.json` to `config/randox/id-map.json`, set `RANDOX_ID_MAP_FILE=./config/randox/id-map.json`, and put the agreed panel and test ids in it. Alternatively — and preferably — leave the file minimal and do this from the console instead: **Panels → Randox panel mapping → Refresh from Randox**, then pick our panel against each of theirs. That mapping is stored in the database, survives every refresh, records who set it, and takes precedence over the file. A panel with nothing mapped against it cannot be ordered; ordering refuses rather than sending a partial order.
8. **Say which collection routes you are contractually entitled to offer**: `RANDOX_COLLECTION_METHODS=IN_CLINIC,HOME_KIT,MOBILE_PHLEBOTOMY` — or whichever subset Randox have agreed. It is empty by default and an order requesting an unlisted method is refused before it is sent. Live boot with it empty is refused, because no order could be placed by any route.
9. **Switch the transport**: `RANDOX_TRANSPORT=live`, then `RANDOX_ENABLED=true`. Set them in that order, in one save if the dashboard allows it — `RANDOX_ENABLED=true` with `RANDOX_TRANSPORT=mock` is refused in production, so a partial save will fail the boot rather than ingest fixtures.
10. **Restart the service and read the boot log.** A missing or malformed setting fails the boot and names every one of them at once, with a sentence on what each is for. This is intentional: finding six missing credentials one redeploy at a time is its own kind of outage.
11. **Verify, in the console.** Open **Panels → Randox panel mapping** and press *Refresh from Randox* — that exercises all seven reference endpoints against the live gateway and will fail loudly if the key or the scope is wrong. Then place one real order and watch the **Ingestion log**. Polling is hourly per order, staggered by creation time, so the first status check is up to an hour after the order.

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
| `RANDOX_NEXUS_SCOPE` / `RANDOX_BOOKING_SCOPE` | `https://randoxclinicbooking.onmicrosoft.com/…` | From the STES auth documents. Defaulted. |
| `RANDOX_B2C_TOKEN_URL` | `https://randoxclinicbooking.b2clogin.com/…/oauth2/v2.0/token` | One shared endpoint; per-API overrides exist. |
| `RANDOX_CLINIC_ID` | `146` | Integer. From `GetMyClinicDetails`. |
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
| `RANDOX_BEARER_TOKEN_ENABLED` | `true` | Whether to send a B2C bearer alongside the subscription key. **Unconfirmed:** the spec declares only the subscription key and no bearer scheme at all; the auth PDFs describe B2C ROPC. Flip to `false` without a deploy if the first live call 401s with a valid key — the 401 log line names which combination was sent. The key itself always goes, in the header. |
| `RANDOX_MAX_REQUESTS_PER_MINUTE` | `60` | Outbound pacing, per API. `0` disables it. A gateway `Retry-After` is obeyed regardless. |
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
- **Nothing auto-releases.** A patient sees a report only after a clinician reviews and releases it, and the state machine enforces that server-side: the only route to released is through clinician-reviewed, and the only route into that is from admin-verified.

## Deploy process

Both Railway and Vercel auto-deploy on push to `main` once connected to the GitHub repo. Branch protection means that only happens via a merged, CI-passed PR. The CI workflow (`typecheck` → `lint` → `test` → `build`, all four required) runs on every PR and push to `main`; GitHub branch protection is what actually makes it block merges — see the branch protection step above.

## Rollback

- **Railway**: Service → Deployments → find the last known-good deployment → **Redeploy**. Because migrations run via `prisma migrate deploy` in the start command, rolling back the *code* does not roll back the *schema* — if the bad deploy included a migration, you need to also restore the database (see below) or write a compensating migration, not just redeploy old code against a newer schema.
- **Vercel**: Project → Deployments → find the last known-good deployment → **Promote to Production**. Instant, no build step (it's already built).

## Database restore

Backups run as a Railway **Cron Service** (`apps/server/backup.Dockerfile` + `apps/server/scripts/backup.sh`, set up in the Railway section above), not a GitHub Action — the earlier GitHub Actions version needed Railway Postgres's connection string to be **publicly** reachable, since GitHub's runners are outside Railway's private network; running the same job as a Railway service instead means it can use the **private** `DATABASE_URL` (Railway's internal networking) and Postgres never needs to be exposed to the internet at all.

Nightly at 03:15 UTC: `pg_dump`, gzip-compressed, uploaded to S3-compatible off-platform storage (Cloudflare R2 recommended: free egress, generous free tier, S3-compatible API). Retention: **35 days**, pruned automatically by the same script. This is deliberately separate from whatever backup tier Railway's own Postgres plan includes — a Railway-only backup doesn't help if the incident is Railway itself (account issue, region outage, accidental project deletion). The script fails loudly (non-zero exit, explicit message) rather than silently skipping if `DATABASE_URL` or any `BACKUP_S3_*` variable is missing.

Built and ran this exact image locally before committing it: real `pg_dump` against the local Postgres, real upload/list/delete against a local MinIO instance standing in for R2 — confirmed the dump, the upload, and both branches of the prune logic (kept a recent backup, deleted an artificially-expired one) all actually work, not just that the script reads correctly.

To restore:

```
gunzip -c aspire-bloods-<timestamp>.sql.gz > restore.sql
psql "<target DATABASE_URL>" < restore.sql
```

Restoring into a **new** empty database and re-pointing `DATABASE_URL` (rather than restoring over the live one) is the safer default unless you specifically intend to discard everything written since the backup.

**You need to do, once, before backups start working**: create the R2 (or S3) bucket and an access key pair, then add the `BACKUP_S3_*` variables on the Railway backup cron service (Railway section, step above). Until those exist, the cron job will fail loudly every night (by design) instead of pretending backups are happening — check that service's logs after the first scheduled run.

## Post-deploy smoke checklist

Run through this after the first production deploy, and after any deploy that touches auth, storage, or the release pipeline:

- [ ] Sign up a fresh patient account, complete profile + consents
- [ ] Log in, confirm mandatory 2FA (OTP email actually arrives — this also confirms `RESEND_API_KEY` is real and working)
- [ ] Admin: upload a PDF report for that patient, verify the parsed rows, release it through to `RELEASED`
- [ ] Admin: create a manual-entry report for the same patient on a different date, same marker, confirm it also releases
- [ ] Patient: see both reports, open the marker detail page, confirm the trend graph renders with both points and the reference band
- [ ] Patient: download the original PDF and the Aspire summary PDF — confirms signed file URLs work with the volume-backed storage
- [ ] Trigger an out-of-range result (manual entry with a value outside the reference range) and confirm the escalation email fires
- [ ] **Test login in Safari specifically** — this is the one browser that's historically strictest about third-party cookies, so it's the real test of whether `COOKIE_DOMAIN` is actually working. Log in, refresh the page, confirm the session persists (not silently logged out).
- [ ] Confirm `admin@<practice-admin-email>` has the ADMIN role and a non-admin account does not (checks `ADMIN_EMAILS` took effect)
- [ ] Check Railway logs for the first few minutes of traffic — confirm no patient email addresses, names, or clinical values appear anywhere in the log output

## What I could not do myself

- Creating the GitHub repo, pushing to it, and configuring branch protection (no `gh` CLI or GitHub credentials in this environment)
- Creating the Railway project/services (including the backup cron service), setting environment variables, generating domains, creating the volume
- Creating the Vercel project, setting environment variables, adding the domain
- Adding the IONOS DNS records
- Creating an R2/S3 bucket and access keys for backups, and adding the `BACKUP_S3_*` variables on the Railway backup service
- Verifying DNS propagation, certificate issuance, and the Safari cookie behavior in production — all of this needs the real domains to exist first

Everything else — the code changes needed to make the split topology, cookie domain, CORS, migration-gated deploys, persistent rate limiting, and PDF storage all actually work — is done and committed.
