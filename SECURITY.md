# Aspire Bloods — Security Documentation

This documents the security controls built into the application. It complements [PRIVACY.md](PRIVACY.md), which covers the data-protection/legal side.

## Reporting a vulnerability

If you believe you've found a security issue in this codebase, please contact the practice's technical contact directly rather than opening a public issue. Include steps to reproduce and the potential impact. This is a healthcare system handling special-category data — please give reasonable time to remediate before any public disclosure.

## Authentication

- **Password hashing**: Argon2id (`lib/password.ts`) — memory-hard, resistant to GPU cracking.
- **Mandatory 2FA**: every patient login requires a 6-digit OTP (email by default; SMS behind `SMS_ENABLED`, off by default). OTP codes are hashed at rest, single-use, expire after 10 minutes, and are invalidated after 5 incorrect attempts.
- **"Trust this device"** is capped at 30 days and is a distinct, hashed, per-device token — not a blanket bypass of 2FA.
- **Sessions**: short-lived access token (JWT, 15 min default) + rotating opaque refresh token (hashed at rest, 30-day default), both httpOnly, `SameSite=Lax`, `Secure` in production. Refresh tokens are single-use — each refresh revokes the old token and issues a new one (rotation), so a stolen refresh token has a narrow window of use before rotation invalidates it.
- **Idle timeout, which is a separate control from either token**: 90 minutes for a patient, **15 for staff** (`packages/shared/src/session.ts`, pinned by `idleSession.test.ts`). The two are separate constants and raising one must never raise the other — a clinic workstation is a shared physical space where the risk is somebody walking past, and a patient's own phone is not. A warning appears before the window closes, capped at 5 minutes' lead for a patient and 3 for staff. Neither number is the access-token lifetime or the refresh-token lifetime; those are security primitives and are untouched by it.
- **Rate limiting / login lockout**: login, signup, verification-resend, and OTP endpoints are hard-limited per IP (`express-rate-limit`, every limit and window configurable via env), independent of the OTP attempt counter above. Backed by a Postgres-based store (`lib/postgresRateLimitStore.ts`), not the default in-memory one — the in-memory store loses all limiter state on every process restart, which on Railway means every deploy.
  - The login lockout is **10 failed attempts in 2 minutes** (`LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_SECONDS`). It was previously 5-in-15-minutes, which fired on ordinary mistyping and shut real patients out of their own results for a quarter of an hour. Ten in two minutes is far below any useful guessing rate while being effectively unreachable by hand.
  - The counter is **cleared on any successful sign-in**, so a person who fumbles their password and then gets it right does not begin their next sign-in already part-way to a lock.
  - OTP verification keeps the **tighter** limit (`OTP_RATE_LIMIT_MAX` / `OTP_RATE_LIMIT_WINDOW_SECONDS`, 5 in 15 minutes). Its search space is six digits, and a caller who has reached that step already holds a valid password — a generous allowance there is a materially different risk from a generous allowance on a password field. **Email verification shares that same bucket**: it is the same six digits being guessed at the same stakes, and giving it its own budget would hand an attacker a second allowance for free.
  - 429 responses carry `retryAfterSeconds` so the UI counts the lock down rather than saying "try again shortly".
- **Open registration, gated verification**: anyone can register at `/signup`. A new account holds no clinical data at all — results reach it only when an admin explicitly links them (see *Result linking* below) — so registration itself is not an access-control boundary and is not gated. The account is created `PENDING_VERIFICATION`, which cannot log in; entering the emailed six-digit code activates it and immediately begins mandatory 2FA enrolment. There is no code path from registration to a session that skips either step.
  - Verification is a **code, not a link**, matching 2FA — one mental model for both steps, and no link route left standing alongside it. The code carries the same controls as an OTP: capped attempts (5), capped reissues (3), a 30-second resend cooldown, and every outstanding code retired the moment a new one is issued, so exactly one is ever live.
  - Its lifetime is `EMAIL_VERIFICATION_TTL_MINUTES` (default 20, accepted range 5–60), not the day the old link had. Six digits is a million-wide search space; a day-long window on that entropy is the wrong trade, and the code only has to survive a trip to someone's inbox.
- **Admin role**: unchanged and unaffected by open registration. `ADMIN_EMAILS` remains the only source of the ADMIN role, re-derived from the environment on every request (`lib/adminAccess.ts`); every account `/signup` creates is stored as a patient, and no route, seed, or setting anywhere grants the role another way.
- **No user enumeration**: login failure responses are identical whether the email doesn't exist or the password is wrong; a dummy Argon2 hash is verified against in the not-found case to keep timing consistent. `/signup` and the verification-resend endpoint likewise respond identically for a fresh address and an already-registered one — the existing account holder is told by email instead. This is why verification is keyed on `(email, code)` rather than a challenge id: `/signup`'s response carries nothing the code step needs, so it can stay byte-identical either way. It is also why the resend cooldown and reissue cap are enforced **silently** there rather than returned as 429s the way OTP resend can afford to — at that point the caller has proved nothing, so the response must not vary. The one deliberate exception is a **correct** password against an unverified account, which returns "confirm your email first": whoever supplied that password owns the account, so it discloses nothing to a stranger.

## Result linking

Registration being open moves all the risk to one decision: whose results are these? Wrong-patient results is the worst failure this system has, so `modules/admin/linkingService.ts` enforces, server-side:

- Nothing is matched automatically. A result that arrives without a resolvable patient reference is parked in an `UnmatchedResult` queue — never written as a `Report` with a guessed owner.
- **A name is never sufficient.** Date of birth must agree as well; if the lab supplied no date of birth, the link is refused outright rather than falling back to the weaker signal.
- The admin must restate the date of birth they matched on, and the server checks it against its own copy of the account before accepting the link.
- Linking and unlinking are both audited, with **what agreed** recorded on the entry (`RESULT_LINKED_TO_PATIENT` / `RESULT_UNLINKED_FROM_PATIENT`), so a later review can ask on what basis, not just when.
- Unlinking voids the report — removing it from the patient's portal immediately, including after release — and returns the result to the queue. Nothing is deleted.
- Linking lands a report at `PARSED` and releases it only if the parse was CLEAN, exactly as an automatic ingestion does. A delivery carrying any hold reason cannot be released by that path or any other until a person acknowledges the reasons.

## Authorization

- Every route is gated by `authGuard` (valid session) and, where relevant, `roleGuard` (PATIENT / ADMIN / CLINICIAN) — enforced server-side on every request, not just hidden client-side.
- The report release pipeline is a strict server-enforced state machine (`UPLOADED → PARSED → RELEASED`, with a `CHANGES_REQUESTED` back-edge). Each transition checks the current status and the actor's role before proceeding.
- **Results release automatically (Aug 2026).** A clean parse reaches the patient with no human step — the practice's decision, on the reasoning that a patient not seeing their own abnormal result is worse than them seeing it, and a result sitting in a queue nobody opens is the real risk. Two server-side refusals replace the removed gate, and neither can be defeated by nobody opening a screen:
  - `release` is permitted only from `PARSED`, so nothing unread and nothing that has been sent back can reach a patient; and
  - a report carrying `holdReasons` cannot be released at all — by automation or by a person — until those reasons are acknowledged in the same action, which is stamped on the report and named in the audit entry. Nothing automatic may pass that acknowledgement.
- The hold conditions are a closed list of five (`lib/cleanParse.ts`): an unmapped analyte, a row that could not be filed, a void or caveat code not in the configured map, a laboratory high/low flag that disagrees with the range they sent, and a delivery the laboratory has not finished. Production still refuses to start with `RANDOX_TRANSPORT=live` while the code map is the checked-in placeholder.
- Out-of-range escalation to the practice fires **before** the release commits, so the clinic and the patient learn at the same moment, and a significantly out-of-range result escalates more loudly than a mildly out-of-range one. A notification failure is audited and never blocks the release.
- **There is exactly ONE human gate and it is the clinical review (Aug 2026).** The `ADMIN_VERIFIED` stage was removed: it existed to catch transcription errors from a PDF, and results arrive structured through the Randox API, so it added a delay and a typo risk without adding a check. Entering or correcting results (`verify`) is still an action but no longer advances a status, so it cannot be a gate. Nothing auto-publishes and there is no setting that skips the review.
- **A parse that is not clean holds the report, and approving it anyway is recorded.** With no stage left to park a problem in, `holdReasons` on the report carries it (`lib/cleanParse.ts`: an unmapped analyte, an unfiled row, a code not in our map, a disagreement with the lab's own high/low flag, an unfinished delivery). `reviewReport` refuses to approve a held report unless the clinician acknowledges the reasons in the same action; the acknowledgement and the reasons as they stood are written to the report and into the audit entry, because the report's own holds are cleared by the next correction.
- Patients can only fetch their **own** `RELEASED` reports; ownership and release-status are checked on every patient-facing query, not assumed from the URL.

## Transport & headers

- `helmet` is applied globally with a strict Content-Security-Policy: `default-src 'self'`, no external script/font/style hosts, `frame-ancestors 'none'`, `object-src 'none'`. **Fonts are served from this origin** — the three woff2 files are vendored into `apps/web/public/assets/fonts` and preloaded from there (the `@fontsource` packages are the SOURCE of those files, not the runtime path, because a preload needs a stable unhashed URL). `font-src 'self'` therefore holds with nothing relaxed, and there is no Google Fonts request anywhere in the product. `style-src` allows `'unsafe-inline'` only (never `script-src`) because chart rendering (Recharts/SVG) sets inline style attributes — a documented, narrow exception.
- The static web app carries the same policy from the edge (`vercel.json`), and `script-src 'self'` there means **no inline `<script>` anywhere in `index.html`** — the pre-paint theme resolver is `public/theme-bootstrap.js`, a parser-blocking file from this origin, precisely so the policy does not have to be relaxed for it. `'unsafe-inline'` is never added to `script-src` to quiet a console message; the thing injecting the script gets fixed instead. Guarded by `apps/web/src/lib/theme.test.ts` (the source) and `e2e/route-console.spec.ts` (the served page).
- `X-Powered-By` is disabled.
- `trust proxy` is enabled in production (Railway sits behind a reverse proxy) so `req.ip` and secure-cookie detection are correct.

## CSRF

Double-submit cookie pattern (`middleware/csrf.ts`): a non-httpOnly `csrf_token` cookie is set alongside the session at login/refresh; the SPA echoes it as an `X-CSRF-Token` header on every mutating request. The server compares the two with a constant-time comparison. Applied to all authenticated mutating routes (invite, upload, verify, review, release, consent withdrawal, erasure request, etc.). Pre-session endpoints (login, activate, OTP verify) are exempt by necessity — there is no session cookie yet to double-submit against; `SameSite=Lax` is the primary mitigation there.

## Input validation

Every request body is validated with `zod` schemas (shared between client and server via `@aspire-bloods/shared` where the shape is reused) before touching business logic. File uploads are restricted to `application/pdf`, size-capped at 20MB, and processed in memory (never written to disk unvalidated).

## Encryption at rest

See [PRIVACY.md §3](PRIVACY.md#3-encryption--access-control). AES-256-GCM at the application layer for PII/health fields; a separate HMAC secret (`JWT_REFRESH_SECRET`, reused as the token-hashing key) for one-way hashing of opaque tokens (invite tokens, refresh tokens, OTP codes) — deliberately not the same key material as the reversible field encryption.

## File access

Original lab PDFs and generated summary PDFs are never served from a public path. Access always goes through a signed, HMAC-verified, short-expiry download token (`lib/signedUrl.ts`, default 10-minute TTL) minted by an authenticated, ownership-checked request. This is the local-disk equivalent of an S3 presigned URL — swapping to real object storage later is a drop-in behind the same `StorageAdapter` interface.

## Error handling & process safety

Every async Express route handler is wrapped in `asyncHandler` so a rejected promise reaches Express's error-handling middleware instead of crashing the Node process — this was a real bug caught during development (a malformed PDF triggered an unhandled rejection that took the whole server down before this was added). A global error-handling middleware and a `process.on('unhandledRejection', ...)` safety net are the last line of defence; both log full detail server-side and return a generic message to the client.

## Audit logging

Insert-only `AuditLogEntry` table capturing actor, action, target, IP, and timestamp for logins (success/failure), consent changes, uploads, parses, verifications, reviews, releases, exports, invites, and erasure lifecycle events. No application code path updates or deletes audit rows.

**Reading is audited as well as writing.** Every admin view of patient data writes a `PATIENT_DATA_VIEWED` entry naming the staff member, the patient and the time — opening a patient record, their report list, an individual report, or a DSAR export. An edit log answers "who changed my results"; only a view log answers "who looked at them", and in a practice the second question is the one that gets asked. One deliberate exception, documented at the call site: listing the unmatched-result queue does not write an entry per patient, because at that point no patient has been identified.

## Third-party model use in the parse path

Uploaded laboratory PDFs are extracted with the help of an Anthropic model whenever `ANTHROPIC_API_KEY` is set; without it the regex extractor runs instead and nothing leaves the server. Two things follow and both matter:

- **The whole report text goes to the API**, up to 150,000 characters, unredacted — including whatever patient identity the laboratory printed on the document. It is a sub-processor relationship and is recorded as one in [PRIVACY.md §7](PRIVACY.md#7-sub-processors).
- **It is not a trust boundary.** Nothing the model returns is persisted without an admin confirming it in the verify table, exactly as with the regex extractor. The prompt is written around the failure mode that matters — a wrong-but-plausible value (5.4 read as 54) is far more dangerous than an obviously failed extraction, because the regex fallback fails loudly with zero rows and a model can fail quietly — and every row carries the verbatim source text so the admin can check the reading against the original.

## Randox API integration

Off unless `RANDOX_ENABLED` is set, and running against in-process fixtures unless `RANDOX_TRANSPORT=live`.

- **The subscription key is sent as a header, never as a query parameter.** The OpenAPI document declares both forms; the query form puts a live credential into every access log and proxy trace between here and the gateway, so only the header form is implemented.
- **Production refuses to start with `RANDOX_TRANSPORT=live` while the void/caveat code map is the checked-in placeholder.** A void code is what says a result is unreportable, and defaulting an unrecognised one to "reportable" would publish a result the laboratory withdrew.
- **Prices are stripped at the transport boundary.** `GetPanels` and `GetTests` both return cost and currency; `stripPricing()` deletes them recursively on the way in, so they never reach the database and are never one `select` away from a patient's screen.
- **An unrecognised analyte holds the report rather than being guessed at.** Matching is exact-then-normalised only, with no fuzzy fallback: it goes to an exception queue for an admin, and the report stays at `PARSED`. A clinician must never be shown a panel with a result silently missing from it, and a wrong mapping is worse than an absent one because nothing catches it.

## Feature flags as a security surface

`VITE_BOOKING_ENABLED` is unset, and the patient-facing booking flow is therefore absent from the production bundle entirely rather than merely hidden — Rollup constant-folds the flag, so `features/booking` and `lib/booking` are not shipped. The routes it owned redirect rather than 404 because they are in people's bookmarks. The server's Randox ordering chain is deliberately NOT behind this flag and keeps working, because that is what whatever books on the main site will call; it has its own switch (`RANDOX_ENABLED`).

## Dev/test 2FA bypass (explicit opt-in only)

`EXPOSE_DEV_OTP_CODE=true` makes the login endpoint return the raw OTP code in its response, so local development and the Playwright e2e suite don't need to read it from the email/SMS provider log. It is **off by default**, validated through the same env schema as everything else, and is deliberately **not** derived from `NODE_ENV` — a misconfigured staging deployment with `NODE_ENV=development` must not accidentally leak live 2FA codes. Never set this true anywhere internet-reachable.

## Dependency notes

- `unpdf` (actively maintained, wraps current `pdfjs-dist`) is used for PDF text extraction — an earlier attempt with `pdf-parse` (which bundles a 7-year-old `pdf.js`) failed to parse a normally-generated PDF during testing and was replaced.
- `multer` is pinned to the 2.x line — 1.x has known CVEs patched in 2.x.
- Recharts 3.x (not the deprecated 2.x branch).

## Known accepted risks / follow-ups

- The Randox PDF parser (`RandoxPortalAdapter`) uses a best-effort regex heuristic, and the model-assisted path above sits in front of it. This is intentional and safe **only because** parsed values are never persisted without admin verification in the confirmation table — treat parsing accuracy as a UX convenience, not a trust boundary.
- Local-disk file storage is the default `StorageAdapter`, pointed at a Railway Volume in production. It is adequate for a single-instance deployment; a multi-instance deployment would need a shared/object storage backend (the interface supports this without code changes elsewhere).
- ~~**`ReferenceRange` holds two different things**~~ — **fixed August 2026.** It held the catalogue of suggested fallbacks AND one row per result ever materialised, so a seeder's `findFirst` on marker-and-sex landed on a record of what one patient's laboratory printed far more often than on the catalogue row (3,080 against 89), and one run overwrote ten of them in place. They are two tables now: `ReferenceRange` is the catalogue, `ResultReferenceRange` is the per-result record, `ReportResult.referenceRangeId` is UNIQUE, and a Marker has no relation to the records at all — so the resolver cannot be handed one. Every catalogue write goes through `lib/catalogueRanges.ts`, which asserts the row is a catalogue row first. The migration relocated every row rather than deleting any, and the tie-break is now a total order (specificity, provenance, `createdAt`, `id`). See `docs/audits/reference-ranges.md`.
- **The analyte map is unverified against a real Randox payload**, and the figure claiming so is hardcoded at zero on purpose. An absent mapping is caught by the exception queue; a wrong one is not caught by anything, which is why the map has no fuzzy matching.
- **No clinician has reviewed the 442 patient-facing marker explanations.** The review status now reflects that honestly — the seed used to mark 72 of them approved under fixture accounts and now retracts every one with an audit entry (`prisma/seed.ts`, `lib/explanationReview.ts`). A row the product reports as checked is worse than a DRAFT one, because nobody goes back to it.
