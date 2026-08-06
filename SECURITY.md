# Aspire Bloods — Security Documentation

This documents the security controls built into the application. It complements [PRIVACY.md](PRIVACY.md), which covers the data-protection/legal side.

## Reporting a vulnerability

If you believe you've found a security issue in this codebase, please contact the practice's technical contact directly rather than opening a public issue. Include steps to reproduce and the potential impact. This is a healthcare system handling special-category data — please give reasonable time to remediate before any public disclosure.

## Authentication

- **Password hashing**: Argon2id (`lib/password.ts`) — memory-hard, resistant to GPU cracking.
- **Mandatory 2FA**: every patient login requires a 6-digit OTP (email by default; SMS behind `SMS_ENABLED`, off by default). OTP codes are hashed at rest, single-use, expire after 10 minutes, and are invalidated after 5 incorrect attempts.
- **"Trust this device"** is capped at 30 days and is a distinct, hashed, per-device token — not a blanket bypass of 2FA.
- **Sessions**: short-lived access token (JWT, 15 min default) + rotating opaque refresh token (hashed at rest, 30-day default), both httpOnly, `SameSite=Lax`, `Secure` in production. Refresh tokens are single-use — each refresh revokes the old token and issues a new one (rotation), so a stolen refresh token has a narrow window of use before rotation invalidates it.
- **Rate limiting / login lockout**: login, signup, verification-resend, and OTP endpoints are hard-limited per IP (`express-rate-limit`, every limit and window configurable via env), independent of the OTP attempt counter above. Backed by a Postgres-based store (`lib/postgresRateLimitStore.ts`), not the default in-memory one — the in-memory store loses all limiter state on every process restart, which on Railway means every deploy.
  - The login lockout is **10 failed attempts in 2 minutes** (`LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_SECONDS`). It was previously 5-in-15-minutes, which fired on ordinary mistyping and shut real patients out of their own results for a quarter of an hour. Ten in two minutes is far below any useful guessing rate while being effectively unreachable by hand.
  - The counter is **cleared on any successful sign-in**, so a person who fumbles their password and then gets it right does not begin their next sign-in already part-way to a lock.
  - OTP verification keeps the **tighter** limit (`OTP_RATE_LIMIT_MAX` / `OTP_RATE_LIMIT_WINDOW_SECONDS`, 5 in 15 minutes). Its search space is six digits, and a caller who has reached that step already holds a valid password — a generous allowance there is a materially different risk from a generous allowance on a password field.
  - 429 responses carry `retryAfterSeconds` so the UI counts the lock down rather than saying "try again shortly".
- **Open registration, gated verification**: anyone can register at `/signup`. A new account holds no clinical data at all — results reach it only when an admin explicitly links them (see *Result linking* below) — so registration itself is not an access-control boundary and is not gated. The account is created `PENDING_VERIFICATION`, which cannot log in; confirming the emailed link activates it and immediately begins mandatory 2FA enrolment. There is no code path from registration to a session that skips either step.
- **Admin role**: unchanged and unaffected by open registration. `ADMIN_EMAILS` remains the only source of the ADMIN role, re-derived from the environment on every request (`lib/adminAccess.ts`); every account `/signup` creates is stored as a patient, and no route, seed, or setting anywhere grants the role another way.
- **No user enumeration**: login failure responses are identical whether the email doesn't exist or the password is wrong; a dummy Argon2 hash is verified against in the not-found case to keep timing consistent. `/signup` and the verification-resend endpoint likewise respond identically for a fresh address and an already-registered one — the existing account holder is told by email instead. The one deliberate exception is a **correct** password against an unverified account, which returns "confirm your email first": whoever supplied that password owns the account, so it discloses nothing to a stranger.

## Result linking

Registration being open moves all the risk to one decision: whose results are these? Wrong-patient results is the worst failure this system has, so `modules/admin/linkingService.ts` enforces, server-side:

- Nothing is matched automatically. A result that arrives without a resolvable patient reference is parked in an `UnmatchedResult` queue — never written as a `Report` with a guessed owner.
- **A name is never sufficient.** Date of birth must agree as well; if the lab supplied no date of birth, the link is refused outright rather than falling back to the weaker signal.
- The admin must restate the date of birth they matched on, and the server checks it against its own copy of the account before accepting the link.
- Linking and unlinking are both audited, with **what agreed** recorded on the entry (`RESULT_LINKED_TO_PATIENT` / `RESULT_UNLINKED_FROM_PATIENT`), so a later review can ask on what basis, not just when.
- Unlinking voids the report — removing it from the patient's portal immediately, including after release — and returns the result to the queue. Nothing is deleted.
- Linking lands a report at `ADMIN_VERIFIED`, never past it: the clinician review and release gate is untouched.

## Authorization

- Every route is gated by `authGuard` (valid session) and, where relevant, `roleGuard` (PATIENT / ADMIN / CLINICIAN) — enforced server-side on every request, not just hidden client-side.
- The report release pipeline is a strict server-enforced state machine (`UPLOADED → PARSED → ADMIN_VERIFIED → CLINICIAN_REVIEWED → RELEASED`, with a `CHANGES_REQUESTED` back-edge). Each transition checks the current status and the actor's role before proceeding — e.g. a clinician cannot release a report that hasn't been reviewed, an admin cannot perform the clinical review step.
- Patients can only fetch their **own** `RELEASED` reports; ownership and release-status are checked on every patient-facing query, not assumed from the URL.

## Transport & headers

- `helmet` is applied globally with a strict Content-Security-Policy: `default-src 'self'`, no external script/font/style hosts (fonts are bundled via `@fontsource`, not loaded from a CDN), `frame-ancestors 'none'`, `object-src 'none'`. `style-src` allows `'unsafe-inline'` only (never `script-src`) because chart rendering (Recharts/SVG) sets inline style attributes — a documented, narrow exception.
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

## Dev/test 2FA bypass (explicit opt-in only)

`EXPOSE_DEV_OTP_CODE=true` makes the login endpoint return the raw OTP code in its response, so local development and the Playwright e2e suite don't need to read it from the email/SMS provider log. It is **off by default**, validated through the same env schema as everything else, and is deliberately **not** derived from `NODE_ENV` — a misconfigured staging deployment with `NODE_ENV=development` must not accidentally leak live 2FA codes. Never set this true anywhere internet-reachable.

## Dependency notes

- `unpdf` (actively maintained, wraps current `pdfjs-dist`) is used for PDF text extraction — an earlier attempt with `pdf-parse` (which bundles a 7-year-old `pdf.js`) failed to parse a normally-generated PDF during testing and was replaced.
- `multer` is pinned to the 2.x line — 1.x has known CVEs patched in 2.x.
- Recharts 3.x (not the deprecated 2.x branch).

## Known accepted risks / follow-ups

- The Randox PDF parser (`RandoxPortalAdapter`) uses a best-effort regex heuristic. This is intentional and safe **only because** parsed values are never persisted without admin verification in the confirmation table — treat parsing accuracy as a UX convenience, not a trust boundary.
- Local-disk file storage is the default `StorageAdapter`. It is adequate for a single-instance deployment; a multi-instance deployment would need a shared/object storage backend (the interface supports this without code changes elsewhere).
