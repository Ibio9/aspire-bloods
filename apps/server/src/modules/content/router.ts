import { Router } from 'express';
import { prisma } from '../../db/client.js';
import { asyncHandler } from '../../lib/asyncHandler.js';

/** Public (unauthenticated) — the footer disclaimer must render on the login page too. */
export const contentRouter = Router();

contentRouter.get(
  '/footer-disclaimer',
  asyncHandler(async (_req, res) => {
    const copy = await prisma.copyBlock.findUnique({ where: { slug: 'footer_disclaimer' } });
    res.json({ body: copy?.body ?? '' });
  }),
);
