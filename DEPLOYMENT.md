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
