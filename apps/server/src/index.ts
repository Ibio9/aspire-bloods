import 'dotenv/config';
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
import { purgeExpiredRateLimitHits } from './lib/postgresRateLimitStore.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { authRouter } from './modules/auth/router.js';
import { reportsRouter } from './modules/reports/router.js';
import { panelsRouter } from './modules/panels/router.js';
import { adminRouter } from './modules/admin/router.js';
import { filesRouter } from './modules/storage/filesRouter.js';
import { patientsRouter } from './modules/patients/router.js';
import { contentRouter } from './modules/content/router.js';

runProductionBootChecks();

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
// crash the process and take down every other user's session with it.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled request error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
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

app.listen(env.PORT, () => {
  console.log(`Aspire Bloods server listening on port ${env.PORT} (${env.NODE_ENV})`);
});
