import type { RandoxCatalogueKind } from '@prisma/client';
import { prisma } from '../../db/client.js';

/**
 * Resolves one of our catalogue keys to Randox's integer id.
 *
 * Two sources, in order:
 *   1. the cached catalogue an admin has mapped (RandoxCatalogueEntry), and
 *   2. the static id map file, for a deployment that hasn't refreshed
 *      reference data yet.
 *
 * Returns null when neither knows — never a guess. An unresolved id means
 * the order is refused, which is the only safe answer: sending the wrong
 * integer orders the wrong test on a real person.
 *
 * Separate from referenceDataService.ts only to keep an import cycle out of
 * orderService (referenceDataService imports the client, the client imports
 * config, and orderService imports both).
 */
export async function mappedRandoxIdFor(
  kind: RandoxCatalogueKind,
  ourKey: string,
  fallbackFromIdMap: string | undefined,
): Promise<number | null> {
  const entry = await prisma.randoxCatalogueEntry.findFirst({
    where: { kind, mappedKey: ourKey, isCurrent: true },
  });

  const candidate = entry?.randoxId ?? fallbackFromIdMap;
  if (!candidate) return null;

  const parsed = Number(candidate);
  return Number.isInteger(parsed) ? parsed : null;
}
