# Aspire Bloods

Patient-facing blood test results portal for Aspire Clinic. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) for the data-protection and security design.

## Stack

- **apps/web** — React 18 + TypeScript + Vite + Tailwind, Recharts for trend graphs
- **apps/server** — Node 20 + Express + TypeScript, Prisma/PostgreSQL
- **packages/shared** — design tokens, shared types, zod schemas used by both

## Local setup

1. **Install dependencies** (from the repo root):
   ```
   npm install
   ```

2. **Start Postgres**:
   ```
   docker compose up -d
   ```

3. **Configure environment**: copy `.env.example` to `.env` at the repo root, and generate real secrets for the placeholder values (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`, `FILE_SIGNING_SECRET`, `ENCRYPTION_KEY`). A quick way:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"       # for the *_SECRET vars
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"    # for ENCRYPTION_KEY
   ```
   Copy the same `.env` into `apps/server/.env` too (Prisma CLI reads from the server package's directory).

4. **Run migrations and seed data**:
   ```
   cd apps/server
   npx prisma migrate deploy
   npx tsx prisma/seed.ts
   ```
   This prints dev admin/clinician logins and a demo patient invite token to the console — save those.

5. **Run the app** (two terminals, from repo root):
   ```
   npm run dev:server
   npm run dev:web
   ```
   Web: http://localhost:5173 (proxies `/api` to the server on :4000).

## Email/SMS in development

`RESEND_API_KEY` is empty by default — emails (OTP codes, invites, escalation notices) are printed to the server console instead of actually sent, so the app is fully runnable without a Resend account. Set a real key to send for real.

SMS is disabled by default (`SMS_ENABLED=false`) — Twilio is wired up but inactive until a real account is configured; see [SECURITY.md](SECURITY.md).

## Tests

```
npm run typecheck     # tsc, both workspaces
npm run lint           # eslint, both workspaces
npm test              # vitest, both workspaces
npm run test:e2e      # Playwright — auth+2FA and the release-gate
```

CI (`.github/workflows/ci.yml`) runs all four on every PR and push to `main`; branch protection requires it to pass before merging — see [DEPLOYMENT.md](DEPLOYMENT.md).

## Deploying

Split topology: `apps/web` deploys to Vercel, `apps/server` + Postgres deploy to Railway, on `blood.aspireshield.com` / `api.blood.aspireshield.com`. Full first-time setup, exact dashboard steps, the cookie-domain reasoning, secrets-by-platform table, rollback, DB restore, and the post-deploy smoke checklist are all in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## What's a placeholder / not live yet

See the "Assumptions / gaps" and "Known accepted risks" sections of [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) — notably: no real Aspire logo file (text wordmark used instead), Randox API integration is a scaffold pending the practice's £5,000 API activation, SMS is code-complete but switched off, and panel→marker composition was assembled from public knowledge of Randox's panel positioning (not an internal spec sheet) and should be reviewed by the practice before go-live.
