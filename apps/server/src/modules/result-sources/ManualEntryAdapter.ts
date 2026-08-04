import { prisma } from '../../db/client.js';
import type { ResultSourceAdapter, ParsedReport } from './ResultSourceAdapter.js';
import { NotImplementedError } from './ResultSourceAdapter.js';

/**
 * Marker for the manual-entry route (§2.5) — there is no document to
 * fetch or parse here, so both of those throw. The actual entry flow
 * (modules/reports/manualEntryService.ts) writes results directly from
 * admin-typed form data and skips straight to the same verify→review→
 * release gate every other source goes through — "adapter" in name only,
 * kept for symmetry with the Source enum and so `ResultSourceAdapter` has
 * exactly one implementation per seeded source.
 */
export class ManualEntryAdapter implements ResultSourceAdapter {
  async fetchResults(): Promise<Buffer> {
    throw new NotImplementedError('ManualEntryAdapter.fetchResults (there is no source document — see manualEntryService)');
  }

  async normaliseReport(): Promise<ParsedReport> {
    throw new NotImplementedError('ManualEntryAdapter.normaliseReport (there is no source document — see manualEntryService)');
  }

  async listPanels(): Promise<{ key: string; name: string }[]> {
    const panels = await prisma.panel.findMany({ where: { isActive: true }, select: { key: true, name: true } });
    return panels;
  }
}
