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

/**
 * The catalogue's health areas, for the category filter on the results and
 * all-markers screens.
 *
 * Public alongside the rest of this router, and safe to be: these are the
 * names of the areas the clinic tests in — "Thyroid Health", "Iron Status" —
 * with no patient, no result and no value anywhere in the response. The
 * filter's contents are catalogue metadata; which of them a given patient has
 * results in is decided client-side from that patient's own authenticated
 * marker list, never from this endpoint.
 */
contentRouter.get(
  '/marker-categories',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.markerCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { key: true, name: true, resultType: true, note: true, sortOrder: true },
    });
    res.json(categories);
  }),
);
