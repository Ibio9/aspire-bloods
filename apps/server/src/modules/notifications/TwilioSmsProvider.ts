import twilio from 'twilio';
import { env } from '../../config/env.js';
import type { SmsMessage, SmsProvider } from './types.js';

/** Concrete SMS implementation. Only ever constructed/used when SMS_ENABLED=true. */
export class TwilioSmsProvider implements SmsProvider {
  private client: ReturnType<typeof twilio>;

  constructor() {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      throw new Error('TwilioSmsProvider requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
    }
    this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  async sendSms(message: SmsMessage): Promise<void> {
    await this.client.messages.create({
      to: message.to,
      from: env.TWILIO_FROM_NUMBER,
      body: message.body,
    });
  }
}

/** No-op used whenever SMS_ENABLED=false — callers should check isSmsEnabled() first. */
export class DisabledSmsProvider implements SmsProvider {
  async sendSms(): Promise<void> {
    throw new Error('SMS is not enabled (SMS_ENABLED=false). Check isSmsEnabled() before calling sendSms.');
  }
}
