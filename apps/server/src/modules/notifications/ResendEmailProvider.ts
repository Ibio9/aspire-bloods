import { Resend } from 'resend';
import { env } from '../../config/env.js';
import type { EmailMessage, EmailProvider } from './types.js';

export class ResendEmailProvider implements EmailProvider {
  private client: Resend | null;

  constructor() {
    this.client = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    if (!this.client) {
      // Dev-safe fallback so the auth flow is runnable without a live
      // Resend API key. Never used in production (RESEND_API_KEY required).
      console.warn(
        `[dev email — RESEND_API_KEY not set] to=${message.to} subject="${message.subject}"\n${message.text}`,
      );
      return;
    }
    const { error } = await this.client.emails.send({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.headers ? { headers: message.headers } : {}),
    });
    if (error) {
      throw new Error(`Resend email send failed: ${error.message}`);
    }
  }
}
