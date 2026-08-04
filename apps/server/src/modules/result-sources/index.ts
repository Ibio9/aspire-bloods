import { env } from '../../config/env.js';
import { PdfUploadAdapter } from './PdfUploadAdapter.js';
import { RandoxApiAdapter } from './RandoxApiAdapter.js';
import type { ResultSourceAdapter } from './ResultSourceAdapter.js';

export const resultSourceAdapter: ResultSourceAdapter =
  env.LAB_ADAPTER === 'RANDOX_API' ? new RandoxApiAdapter() : new PdfUploadAdapter();

export * from './ResultSourceAdapter.js';
export { ManualEntryAdapter } from './ManualEntryAdapter.js';
