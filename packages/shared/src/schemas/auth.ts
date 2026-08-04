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
export const patientProfileFormSchema = z.object({
  title: z.string().max(20).optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  sex: z.enum(['MALE', 'FEMALE']).optional(),
  dob: z.string().date(),
  contactNumber: z.string().min(5).max(30),
  address: z.string().min(1).max(500),
  postcode: z.string().min(1).max(20),
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
// the invite token, plus the email the patient is registering with.
export const signupRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  profile: patientProfileFormSchema,
  consents: consentBlockSchema,
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;
