import { PdfUploadAdapter } from './PdfUploadAdapter.js';

// Admin PDF upload is a distinct route from Randox's API feed — an admin
// can still upload a PDF (Randox white-label or Aspire in-house)
// regardless of whether the API integration is also switched on, so this
// is always the PDF adapter, never LAB_ADAPTER-conditional.
//
// The Randox API is no longer a ResultSourceAdapter. That interface models
// "here is one document, extract rows from it", which fits a PDF upload and
// does not fit an order lifecycle with bookings, status polling, void codes
// and partial deliveries. It lives in modules/randox/ instead, and writes
// into the same normalised store through the same release gate — see
// modules/randox/ingestionService.ts.
export const resultSourceAdapter = new PdfUploadAdapter();

export * from './ResultSourceAdapter.js';
export { PdfUploadAdapter } from './PdfUploadAdapter.js';
export { ManualEntryAdapter } from './ManualEntryAdapter.js';
