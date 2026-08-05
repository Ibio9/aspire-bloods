import { Router } from 'express';
import { prisma } from '../../db/client.js';
import { storageAdapter } from './LocalDiskStorageAdapter.js';
import { verifyFileToken } from '../../lib/signedUrl.js';
import { asyncHandler } from '../../lib/asyncHandler.js';

/**
 * Public-by-design route: the signed, short-expiry token IS the
 * credential (see lib/signedUrl.ts) — no session cookie required here,
 * matching the "signed URL" access model. Nothing is reachable without a
 * valid, unexpired token; there is no directory listing or public bucket.
 */
export const filesRouter = Router();

filesRouter.get(
  '/download',
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const verified = verifyFileToken(token);
    if (!verified) {
      return res.status(403).json({ error: 'Invalid or expired download link' });
    }

    const file = await prisma.storedFile.findUnique({ where: { id: verified.fileId } });
    if (!file) return res.status(404).json({ error: 'File not found' });

    const buffer = await storageAdapter.read(file.storageKey);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalFilename.replace(/"/g, '')}"`);
    res.send(buffer);
  }),
);
