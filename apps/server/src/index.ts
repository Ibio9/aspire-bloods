import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cron from 'node-cron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { prisma } from './db/client.js';
import { runSessionCleanupJob } from './jobs/sessionCleanup.js';
import { runRetentionReviewJob } from './jobs/retentionReview.js';
import { runErasurePurgeJob } from './jobs/erasurePurge.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { authRouter } from './modules/auth/router.js';
import { reportsRouter } from './modules/reports/router.js';
import { panelsRouter } from './modules/panels/router.js';
import { adminRouter } from './modules/admin/router.js';
import { filesRouter } from './modules/storage/filesRouter.js';
import { patientsRouter } from './modules/patients/router.js';
import { contentRouter } from './modules/content/router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.disable('x-powered-by');
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // Railway sits behind a reverse proxy — needed for correct req.ip and secure cookies
}
app.use(securityHeaders);
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

if (env.NODE_ENV === 'production') {
  const webDist = path.resolve(__dirname, '../../web/dist');
  app.use(express.static(webDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

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
cron.schedule('0 3 * * *', () => {
  runRetentionReviewJob().catch((e) => console.error('retentionReviewJob failed:', e));
});
cron.schedule('0 * * * *', () => {
  runErasurePurgeJob().catch((e) => console.error('erasurePurgeJob failed:', e));
});

app.listen(env.PORT, () => {
  console.log(`Aspire Bloods server listening on port ${env.PORT} (${env.NODE_ENV})`);
});
