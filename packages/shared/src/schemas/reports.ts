import { z } from 'zod';

export const verifiedResultRowSchema = z
  .object({
    markerId: z.string().uuid(),
    // Usually a number. A string is a textual lab result — a censored value
    // ("< 0.6", below the assay's detection limit) or a qualitative outcome
    // ("Not detected"). Textual results carry no position against the numeric
    // range, so they are never flagged; anything that needs flagging must be
    // entered as a number.
    value: z.union([z.number(), z.string().trim().min(1)]),
    unit: z.string().min(1),
    referenceLow: z.number(),
    referenceHigh: z.number(),
  })
  .refine((r) => r.referenceLow < r.referenceHigh, {
    message: 'Reference low must be less than reference high',
    path: ['referenceHigh'],
  });

export const verifyReportRequestSchema = z.object({
  sampleDate: z.string().datetime(),
  results: z.array(verifiedResultRowSchema).min(1),
});
export type VerifyReportRequest = z.infer<typeof verifyReportRequestSchema>;

export const releaseReportRequestSchema = z.object({
  reportId: z.string().uuid(),
});
export type ReleaseReportRequest = z.infer<typeof releaseReportRequestSchema>;

// Phase 2 §2.5 — manual entry route.
// A panel is an equal choice, not a required fallback — '' (no panel
// selected in the dropdown) and null both mean "no panel", not an invalid uuid.
const optionalUuid = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().uuid().optional());

export const manualEntryRequestSchema = z.object({
  patientId: z.string().uuid(),
  // Optional — manual entry is exactly the path an ad-hoc set of markers
  // arrives by (a single repeat test, a marker outside any package), and
  // forcing a panel onto it would mean mislabelling the report.
  panelId: optionalUuid,
  sampleDate: z.string().min(1),
  results: z.array(verifiedResultRowSchema).min(1),
  confirmed: z.boolean().optional().default(false),
});
export type ManualEntryRequest = z.infer<typeof manualEntryRequestSchema>;
