import { PdfUploadAdapter } from './PdfUploadAdapter.js';

// Admin PDF upload is a distinct route from Randox's API feed (§3) — an
// admin can still upload a PDF (Randox white-label or Aspire in-house)
// regardless of whether the API integration is also switched on, so this
// is always the PDF adapter, never LAB_ADAPTER-conditional. RandoxApiAdapter
// is instantiated directly by randoxIngestionService.ts, which is the only
// caller that ever runs it.
export const resultSourceAdapter = new PdfUploadAdapter();

export * from './ResultSourceAdapter.js';
export { PdfUploadAdapter } from './PdfUploadAdapter.js';
export { RandoxApiAdapter } from './RandoxApiAdapter.js';
export { ManualEntryAdapter } from './ManualEntryAdapter.js';
