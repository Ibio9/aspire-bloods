import { z } from 'zod';

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const otpVerifyRequestSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().length(6),
  trustDevice: z.boolean().optional().default(false),
});
export type OtpVerifyRequest = z.infer<typeof otpVerifyRequestSchema>;

export const inviteRequestSchema = z.object({
  email: z.string().email(),
});
export type InviteRequest = z.infer<typeof inviteRequestSchema>;

// Mirrors the brand's patient registration form field set (brief §1/§2):
// title, name, DOB, contact, address, postcode, GP name & address,
// medication, allergies, emergency contact.
//
// firstName, lastName, dob and contactNumber are the required core, and they
// are required precisely because they're what an admin matches an incoming
// result against before attaching it to this person (see the server's
// modules/admin/linkingService.ts). Everything else is genuinely optional —
// address and postcode included, since self-registration asks for the
// smallest set that still makes safe linking possible.
export const patientProfileFormSchema = z.object({
  title: z.string().max(20).optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  sex: z.enum(['MALE', 'FEMALE']).optional(),
  dob: z.string().date(),
  contactNumber: z.string().min(5).max(30),
  address: z.string().max(500).optional(),
  postcode: z.string().max(20).optional(),
  gpName: z.string().max(200).optional(),
  gpAddress: z.string().max(500).optional(),
  medication: z.string().max(2000).optional(),
  allergies: z.string().max(2000).optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactNumber: z.string().max(30).optional(),
});
export type PatientProfileForm = z.infer<typeof patientProfileFormSchema>;

const consentBlockSchema = z.object({
  dataProcessing: z.literal(true),
  resultsStorage: z.literal(true),
  commsEmail: z.boolean(),
  commsSms: z.boolean(),
});

export const activateAccountRequestSchema = z.object({
  inviteToken: z.string().min(20),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  profile: patientProfileFormSchema,
  consents: consentBlockSchema,
});
export type ActivateAccountRequest = z.infer<typeof activateAccountRequestSchema>;

// Self-service signup — same registration-form shape as activation, minus
// the invite token, plus the email the patient is registering with. Open to
// anyone: an account with no results attached holds no clinical data, so
// there is nothing here to gate behind approval.
export const signupRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  profile: patientProfileFormSchema,
  consents: consentBlockSchema,
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const verifyEmailRequestSchema = z.object({
  token: z.string().min(20),
});
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const resendVerificationRequestSchema = z.object({
  email: z.string().email(),
});
export type ResendVerificationRequest = z.infer<typeof resendVerificationRequestSchema>;

/**
 * Attaching a result set to a person — the one step in this system where a
 * mistake is genuinely serious, so the request itself is shaped to make an
 * accidental link hard: the admin has to name the patient AND restate the
 * date of birth they matched on AND tick confirm. The server re-checks all
 * three against its own copy rather than trusting any of them (see
 * modules/admin/linkingService.ts) — this is belt and braces, not the control.
 */
export const linkResultRequestSchema = z.object({
  patientId: z.string().uuid(),
  /** The DOB the admin read off the two records and satisfied themselves agree. */
  confirmedDob: z.string().date(),
  confirm: z.literal(true),
});
export type LinkResultRequest = z.infer<typeof linkResultRequestSchema>;

export const unlinkResultRequestSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type UnlinkResultRequest = z.infer<typeof unlinkResultRequestSchema>;
