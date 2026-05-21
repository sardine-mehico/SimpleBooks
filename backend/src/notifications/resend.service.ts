import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

// Thin wrapper over the Resend HTTPS transactional-email API. Chosen as the
// failure-notification channel because it does NOT use customer-facing SMTP —
// so a broken outbound SMTP can't take down the email that warns the user
// their SMTP is broken. Falls back to a no-op (with a log warning) when
// `RESEND_API_KEY` isn't set so the system stays bootable on a fresh install.

@Injectable()
export class ResendService {
  private readonly log = new Logger(ResendService.name);
  private readonly client: Resend | null;
  private readonly fromAddress: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      this.client = new Resend(apiKey);
    } else {
      this.client = null;
      this.log.warn(
        'RESEND_API_KEY unset — failure-notification emails will be skipped (Telegram remains the primary channel).',
      );
    }
    // Until a sender domain is verified, Resend permits using their shared
    // onboarding domain `onboarding@resend.dev`. Replace via env once the
    // operator has verified their own domain.
    this.fromAddress = process.env.RESEND_FROM ?? 'SimpleBooks <onboarding@resend.dev>';
  }

  get isEnabled() {
    return !!this.client;
  }

  async sendPlain(to: string, subject: string, text: string): Promise<{ id?: string }> {
    if (!this.client) {
      this.log.warn(`Resend disabled — skipped notification to ${to}: ${subject}`);
      return {};
    }
    const res = await this.client.emails.send({ from: this.fromAddress, to, subject, text });
    if ('error' in res && res.error) {
      throw new Error(res.error.message ?? 'Resend send failed');
    }
    return { id: (res as { data?: { id: string } }).data?.id };
  }
}
