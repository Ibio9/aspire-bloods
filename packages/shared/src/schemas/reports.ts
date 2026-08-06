import { z } from 'zod';

export const verifiedResultRowSchema = z
  .object({
    markerId: z.string().uuid(),
    value: z.number(),
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
