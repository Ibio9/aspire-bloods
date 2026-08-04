export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  sendEmail(message: EmailMessage): Promise<void>;
}

export interface SmsMessage {
  to: string;
  body: string;
}

/**
 * SMS is a second notification channel behind this interface. Resend
 * (the email provider) cannot send SMS — Twilio is the concrete
 * implementation, but it's env-gated off by default (SMS_ENABLED=false)
 * since it isn't activated for the practice yet. Nothing in app logic
 * should import Twilio directly; always go through this interface.
 */
export interface SmsProvider {
  sendSms(message: SmsMessage): Promise<void>;
}
