import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Env-driven first-run bootstrap. Each step is idempotent — runs on every
// boot but only writes when the target row is missing. UI edits made
// after first run always win (we never overwrite existing rows from env).

@Injectable()
export class BootstrapService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.seedMailConfiguration();
    await this.seedTelegramAllowlist();
    await this.seedAiProviders();
  }

  // ── SMTP ─────────────────────────────────────────────────────────────────

  private async seedMailConfiguration() {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const encryption = process.env.SMTP_ENCRYPTION as 'NONE' | 'SSL' | 'TLS' | 'STARTTLS' | undefined;
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD;
    if (!host || !port || !encryption || !user || !password) {
      const missing = [
        !host && 'SMTP_HOST', !port && 'SMTP_PORT', !encryption && 'SMTP_ENCRYPTION',
        !user && 'SMTP_USER', !password && 'SMTP_PASSWORD',
      ].filter(Boolean);
      if (missing.length > 0 && missing.length < 5) {
        console.warn(`[bootstrap] SMTP partial env — skipping. Missing: ${missing.join(', ')}`);
      }
      return;
    }
    const existing = await this.prisma.mailConfiguration.findFirst();
    if (existing) return;
    await this.prisma.mailConfiguration.create({
      data: {
        smtpServer: host,
        port: Number(port),
        encryption,
        user,
        password,
      },
    });
    console.log('[bootstrap] seeded MailConfiguration from env');
  }

  // ── Telegram allowlist ───────────────────────────────────────────────────

  private async seedTelegramAllowlist() {
    const raw = process.env.TELEGRAM_ALLOWLIST_USERNAMES;
    if (!raw) return;
    const usernames = raw.split(',').map((s) => s.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
    if (usernames.length === 0) return;

    const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true } });
    if (!admin) {
      console.warn('[bootstrap] no admin user; skipping Telegram allowlist seed');
      return;
    }

    let added = 0;
    for (const u of usernames) {
      const existing = await this.prisma.telegramAllowlist.findFirst({ where: { username: u } });
      if (existing) continue;
      // TelegramAllowlist.user is a free-text label today (note about who
      // this Telegram handle belongs to). Set it to admin.username so the
      // bot-as-user wiring (future phase) has a stable hint to resolve.
      await this.prisma.telegramAllowlist.create({
        data: { username: u, user: admin.username },
      });
      added += 1;
    }
    if (added > 0) console.log(`[bootstrap] seeded ${added} Telegram allowlist entries linked to admin`);
  }

  // ── AI providers (two slots) ─────────────────────────────────────────────

  private async seedAiProviders() {
    for (const slot of [1, 2] as const) {
      const name = process.env[`AI_PROVIDER_${slot}_NAME`];
      const model = process.env[`AI_PROVIDER_${slot}_MODEL`];
      const apiBaseUrl = process.env[`AI_PROVIDER_${slot}_API_BASE_URL`];
      const apiKey = process.env[`AI_PROVIDER_${slot}_API_KEY`];
      const rpm = Number(process.env[`AI_PROVIDER_${slot}_RPM`] ?? '15');
      if (!name || !model || !apiBaseUrl || !apiKey) {
        const missing = [
          !name && 'NAME', !model && 'MODEL', !apiBaseUrl && 'API_BASE_URL', !apiKey && 'API_KEY',
        ].filter(Boolean);
        if (missing.length > 0 && missing.length < 4) {
          console.warn(`[bootstrap] AI_PROVIDER_${slot} partial — skipping. Missing: ${missing.join(', ')}`);
        }
        continue;
      }
      const existing = await this.prisma.aiProvider.findFirst({ where: { name } });
      if (existing) continue;
      await this.prisma.aiProvider.create({
        data: {
          name, model, apiBaseUrl, apiKey,
          isPrimary: slot === 1,
          isEnabled: true,
          requestsPerMinute: Number.isFinite(rpm) && rpm > 0 ? rpm : 15,
          sortOrder: slot * 10,
        },
      });
      console.log(`[bootstrap] seeded AI provider ${slot}: ${name}`);
    }
  }
}
