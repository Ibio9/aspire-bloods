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

/**
 * Publish — one admin action that carries a report the whole way from PARSED
 * to RELEASED.
 *
 * Deliberately the same body as verify, because that is exactly what it is:
 * the verified rows, plus a flag saying "and take it all the way". The server
 * still walks every state in turn (verify → review → release), each through
 * its own guard, so nothing here skips a state or writes the terminal one
 * directly. The saving is in interactions, not in checks.
 */
export const publishReportRequestSchema = z.object({
  sampleDate: z.string().datetime(),
  results: z.array(verifiedResultRowSchema).min(1),
  /** Optional reviewer note, recorded on the review transition exactly as the two-step path records it. */
  note: z.string().max(2000).optional(),
  /** Must be true. The single confirmation the clinician gives, restated in the request. */
  confirm: z.literal(true),
  /**
   * Required to publish a report whose parse was not clean.
   *
   * This path runs verify → review → release, and `verify` legitimately CLEARS
   * the holds (a person has just entered every row deliberately). So without this
   * field the one-click path would clear the holds and then find nothing to
   * acknowledge — a bypass of the acknowledgement by ordering rather than by
   * intent. publishReport reads the holds BEFORE verify runs and refuses without
   * it. Defaults to absent, which reads as false: the direction the default has
   * to fail in.
   */
  acknowledgeHolds: z.boolean().optional(),
});
export type PublishReportRequest = z.infer<typeof publishReportRequestSchema>;

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
