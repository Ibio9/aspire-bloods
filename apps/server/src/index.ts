import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import cron from 'node-cron';
import { env } from './config/env.js';
import { runProductionBootChecks } from './lib/productionBootChecks.js';
import { prisma } from './db/client.js';
import { runSessionCleanupJob } from './jobs/sessionCleanup.js';
import { runRetentionReviewJob } from './jobs/retentionReview.js';
import { runErasurePurgeJob } from './jobs/erasurePurge.js';
import { runRandoxPollingJob } from './modules/randox/pollingJob.js';
import { assertRandoxConfigured } from './modules/randox/config.js';
import { syncReferenceDataOnBoot } from './modules/randox/referenceDataService.js';
import { purgeExpiredRateLimitHits } from './lib/postgresRateLimitStore.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { authRouter } from './modules/auth/router.js';
import { reportsRouter } from './modules/reports/router.js';
import { panelsRouter } from './modules/panels/router.js';
import { adminRouter } from './modules/admin/router.js';
import { filesRouter } from './modules/storage/filesRouter.js';
import { patientsRouter } from './modules/patients/router.js';
import { contentRouter } from './modules/content/router.js';
import { randoxRouter } from './modules/randox/router.js';
import { runDemoSeed } from './modules/admin/demoSeedService.js';

runProductionBootChecks();
// Fails the boot — loudly, naming every missing variable at once — if the
// Randox integration is switched on without what a real call needs. The
// alternative is discovering a missing subscription key at the moment a
// patient is standing in the clinic waiting for their order to be placed.
assertRandoxConfigured();

const app = express();

app.disable('x-powered-by');
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // Railway sits behind a reverse proxy — needed for correct req.ip and secure cookies
}
app.use(securityHeaders);
// API-only service — the frontend is a separate Vercel deploy on its own
// origin, so this is a real cross-origin request, not same-site laxness.
// Locked to the exact configured frontend origin; credentials required
// since auth relies on httpOnly cookies, not an Authorization header.
app.use(cors({ origin: env.APP_BASE_URL, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/panels', panelsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/files', filesRouter);
app.use('/api/patient', patientsRouter);
app.use('/api/content', contentRouter);
app.use('/api/randox', randoxRouter);

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Last-resort error boundary: an uncaught error in any route (sync throw or
// a rejected promise forwarded via asyncHandler) must return a 500, never
// crash the process and take down every other user's session with it. The
// full error (which may include stack traces, SQL, or file paths) goes only
// to the server log, keyed by a correlation ID the client can quote back —
// the response body itself never carries that detail.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const correlationId = randomUUID();
  console.error(`[${correlationId}] Unhandled error on ${req.method} ${req.path}:`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong. Please try again.', correlationId });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

// Background jobs — every job logs its own errors rather than throwing,
// so one bad run never crashes the scheduler (or the process).
cron.schedule('*/15 * * * *', () => {
  runSessionCleanupJob().catch((e) => console.error('sessionCleanupJob failed:', e));
});
cron.schedule('*/15 * * * *', () => {
  purgeExpiredRateLimitHits().catch((e) => console.error('rateLimitHit purge failed:', e));
});
cron.schedule('0 3 * * *', () => {
  runRetentionReviewJob().catch((e) => console.error('retentionReviewJob failed:', e));
});
cron.schedule('0 * * * *', () => {
  runErasurePurgeJob().catch((e) => console.error('erasurePurgeJob failed:', e));
});
// Randox order polling. The cron here is only how often the sweeper wakes
// up to look for orders that are DUE — each individual order is still
// polled once an hour, staggered by its own creation time, as Randox ask.
// See modules/randox/pollingJob.ts, which is written to be deleted once
// webhooks land without anything downstream changing.
//
// Automatic ingestion is not automatic publication: this only ever lands
// reports at ADMIN_VERIFIED, never past the clinician review/release gate.
if (env.RANDOX_ENABLED) {
  cron.schedule(env.RANDOX_POLL_CRON, () => {
    runRandoxPollingJob().catch((e) => console.error('randoxPollingJob failed:', e));
  });
}

app.listen(env.PORT, () => {
  console.log(`Aspire Bloods server listening on port ${env.PORT} (${env.NODE_ENV})`);

  // Randox reference data — the ids an order has to carry (biological sex,
  // testing reason, cancellation reason, test clinic location) come from
  // Randox's own lookup endpoints and are never hardcoded, so they are pulled
  // on boot and cached to a TTL.
  //
  // AFTER listen, and never fatal. It makes up to eight outbound calls to a
  // third party, and the entire patient portal — results, trends, downloads,
  // clinician review — works perfectly well without any of them. Refusing to
  // start the product because Randox were slow would be an outage we chose.
  // It logs loudly on failure and the order path refuses on its own when it
  // finds a lookup it needs is empty. See referenceDataService.ts.
  void syncReferenceDataOnBoot();

  // Demo data, only after the server is up. This used to run inside the
  // container start command, before listen — where a platform healthcheck
  // killing a slow boot could take the seed down mid-write with nothing able
  // to log it. Here the healthcheck passes first, the seed's outcome lands
  // in the runtime logs and the DemoSeedRun row, and a failure degrades
  // nothing. A no-op (recorded as SKIPPED) unless SEED_DEMO_DATA=true.
  void runDemoSeed({ trigger: 'boot' }).catch((e) => {
    // runDemoSeed never throws by contract; this is belt and braces.
    console.error('[seedDemo] unexpected escape from runDemoSeed:', e);
  });
});
