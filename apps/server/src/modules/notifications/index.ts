import { env } from '../../config/env.js';
import { ResendEmailProvider } from './ResendEmailProvider.js';
import { DisabledSmsProvider, TwilioSmsProvider } from './TwilioSmsProvider.js';
import type { EmailProvider, SmsProvider } from './types.js';

export const emailProvider: EmailProvider = new ResendEmailProvider();

export const smsProvider: SmsProvider = env.SMS_ENABLED ? new TwilioSmsProvider() : new DisabledSmsProvider();

export function isSmsEnabled(): boolean {
  return env.SMS_ENABLED;
}

export * from './types.js';
