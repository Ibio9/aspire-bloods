export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Extra RFC-822 headers. Added for the escalation path, where a significantly
   * out-of-range result has to be louder than a mildly out-of-range one in the
   * one place a clinician sees before opening anything — the inbox list. Subject
   * wording does most of that work; `Importance` / `X-Priority` are what make a
   * mail client draw it differently.
   *
   * Optional and unused everywhere else: a transactional email that marks itself
   * important is an email nobody believes the next time.
   */
  headers?: Record<string, string>;
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
