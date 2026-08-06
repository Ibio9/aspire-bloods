import { Router } from 'express';
import { prisma } from '../../db/client.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { getClinicContact } from './clinicContact.js';

/** Public (unauthenticated) — the footer disclaimer must render on the login page too. */
export const contentRouter = Router();

// Deliberately public: the clinic's own address and clinical-team inbox are
// on the sign-in page already, and someone locked out of their account is
// exactly the person who most needs to reach a human.
contentRouter.get('/clinic-contact', (_req, res) => {
  res.json(getClinicContact());
});

contentRouter.get(
  '/footer-disclaimer',
  asyncHandler(async (_req, res) => {
    const copy = await prisma.copyBlock.findUnique({ where: { slug: 'footer_disclaimer' } });
    res.json({ body: copy?.body ?? '' });
  }),
);
