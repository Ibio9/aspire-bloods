# Aspire Bloods — Security Documentation

This documents the security controls built into the application. It complements [PRIVACY.md](PRIVACY.md), which covers the data-protection/legal side.

## Reporting a vulnerability

If you believe you've found a security issue in this codebase, please contact the practice's technical contact directly rather than opening a public issue. Include steps to reproduce and the potential impact. This is a healthcare system handling special-category data — please give reasonable time to remediate before any public disclosure.

## Authentication

- **Password hashing**: Argon2id (`lib/password.ts`) — memory-hard, resistant to GPU cracking.
- **Mandatory 2FA**: every patient login requires a 6-digit OTP (email by default; SMS behind `SMS_ENABLED`, off by default). OTP codes are hashed at rest, single-use, expire after 10 minutes, and are invalidated after 5 incorrect attempts.
- **"Trust this device"** is capped at 30 days and is a distinct, hashed, per-device token — not a blanket bypass of 2FA.
- **Sessions**: short-lived access token (JWT, 15 min default) + rotating opaque refresh token (hashed at rest, 30-day default), both httpOnly, `SameSite=Lax`, `Secure` in production. Refresh tokens are single-use — each refresh revokes the old token and issues a new one (rotation), so a stolen refresh token has a narrow window of use before rotation invalidates it.
- **Rate limiting**: login and OTP-verify endpoints are hard-limited per IP (`express-rate-limit`, configurable via env), independent of the OTP attempt counter above.
- **No user enumeration**: login failure responses are identical whether the email doesn't exist or the password is wrong; a dummy Argon2 hash is verified against in the not-found case to keep timing consistent.

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
