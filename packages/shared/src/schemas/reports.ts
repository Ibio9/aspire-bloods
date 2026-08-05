import { z } from 'zod';

export const verifiedResultRowSchema = z.object({
  markerId: z.string().uuid(),
  value: z.number(),
  unit: z.string().min(1),
  referenceLow: z.number(),
  referenceHigh: z.number(),
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
export const manualEntryRequestSchema = z.object({
  patientId: z.string().uuid(),
  panelId: z.string().uuid().nullable().optional(),
  sampleDate: z.string().min(1),
  results: z.array(verifiedResultRowSchema).min(1),
  confirmed: z.boolean().optional().default(false),
});
export type ManualEntryRequest = z.infer<typeof manualEntryRequestSchema>;
