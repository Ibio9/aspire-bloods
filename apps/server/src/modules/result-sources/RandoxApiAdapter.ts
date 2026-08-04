import type { ResultSourceAdapter, ParsedReport } from './ResultSourceAdapter.js';
import { NotImplementedError } from './ResultSourceAdapter.js';

/**
 * Scaffold only. Randox's direct API integration requires a one-off
 * £5,000 activation payment that has not been made — this class exists so
 * the config surface (RANDOX_API_BASE_URL, RANDOX_API_KEY, LAB_ADAPTER
 * env var) is real and the eventual swap is a config change, not a
 * rewrite. Every method throws until it's actually implemented.
 */
export class RandoxApiAdapter implements ResultSourceAdapter {
  async fetchResults(_externalId: string): Promise<Buffer> {
    throw new NotImplementedError('RandoxApiAdapter.fetchResults');
  }

  async normaliseReport(_pdfBuffer: Buffer): Promise<ParsedReport> {
    throw new NotImplementedError('RandoxApiAdapter.normaliseReport');
  }

  async listPanels(): Promise<{ key: string; name: string }[]> {
    throw new NotImplementedError('RandoxApiAdapter.listPanels');
  }
}
