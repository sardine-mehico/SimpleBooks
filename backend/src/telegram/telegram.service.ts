import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Telegraf, Markup } from 'telegraf';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { User as PrismaUser } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { CreateTaskDto } from '../tasks/dto';
import { TelegramAllowlistService } from './allowlist.service';
import { RolesService } from '../roles/roles.service';

const STATUS_EMOJI: Record<string, string> = {
  PENDING: '⏳',
  IN_PROGRESS: '🔵',
  COMPLETED: '✅',
  CANCELLED: '⛔',
};

// In-memory state for two-step flows (new-task title, edit-task title).
// Keyed by Telegram chat id. Resets on backend restart; users re-issue
// the command. No persistence cost is justified for a chat-local flow.
type PendingFlow =
  | { kind: 'newtask' }
  | { kind: 'edit'; taskId: string };

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;
  private pending = new Map<number, PendingFlow>();

  constructor(
    private prisma: PrismaService,
    private tasks: TasksService,
    private allowlist: TelegramAllowlistService,
    private roles: RolesService,
  ) {}

  get isEnabled() { return !!this.bot; }
  get tokenConfigured() { return !!process.env.TELEGRAM_BOT_TOKEN; }

  async onModuleInit() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      this.log.warn('TELEGRAM_BOT_TOKEN unset — Telegram bot disabled');
      return;
    }
    this.bot = new Telegraf(token);

    // Allowlist + user resolution gate. Every incoming update first lands
    // here; the resolved SimpleBooks user is attached to ctx.state so
    // downstream handlers can read their role.
    this.bot.use(async (ctx, next) => {
      const username = ctx.from?.username;
      if (!username) {
        return ctx.reply('Set a public Telegram username on your account before using SimpleBooks.');
      }
      const user = await this.allowlist.resolveUser(username);
      if (!user) {
        this.log.warn(`Rejected @${username} (not on allowlist or no linked user)`);
        return ctx.reply(`Sorry, @${username} is not authorized. Ask an admin to link your handle in Settings → Telegram.`);
      }
      (ctx.state as any).user = user;
      return next();
    });

    // ── Commands ───────────────────────────────────────────────────────────

    this.bot.start(async (ctx) => {
      await this.prisma.telegramChat.upsert({
        where: { chatId: String(ctx.chat.id) },
        update: { username: ctx.from?.username },
        create: { chatId: String(ctx.chat.id), username: ctx.from?.username },
      });
      const u = (ctx.state as any).user as PrismaUser;
      await ctx.reply(
        `Connected as @${ctx.from?.username} (linked to ${u.displayName} · role ${u.role}). Type /help to see commands.`,
      );
    });

    this.bot.help((ctx) =>
      ctx.reply(
        [
          'Commands:',
          '/tasks — list open tasks with Done / Edit / Delete buttons',
          '/newtask <title> — create a task',
          '/newtask alone — bot will ask for the title',
          '/cancel — abandon a pending edit / new-task prompt',
          '/help — this message',
        ].join('\n'),
      ),
    );

    this.bot.command('cancel', async (ctx) => {
      this.pending.delete(ctx.chat.id);
      await ctx.reply('Cancelled.');
    });

    this.bot.command('tasks', async (ctx) => {
      const user = (ctx.state as any).user as PrismaUser;
      if (!(await this.roles.hasCapability(user.role, 'nav.tasks'))) {
        return this.deny(ctx, 'view tasks');
      }
      const tasks = await this.tasks.list();
      const open = tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
      if (open.length === 0) return ctx.reply('No open tasks. 🎉');
      const canDelete = await this.roles.hasCapability(user.role, 'action.delete');
      await ctx.reply(`${open.length} open task(s):`);
      for (const t of open) {
        const buttons = [
          Markup.button.callback('✓ Done', `task:done:${t.id}`),
          Markup.button.callback('✏️ Edit', `task:edit:${t.id}`),
        ];
        if (canDelete) buttons.push(Markup.button.callback('🗑 Delete', `task:delete:${t.id}`));
        await ctx.reply(
          `${STATUS_EMOJI[t.status]} ${t.title}`,
          Markup.inlineKeyboard(buttons),
        );
      }
    });

    this.bot.command('newtask', async (ctx) => {
      const user = (ctx.state as any).user as PrismaUser;
      if (!(await this.roles.hasCapability(user.role, 'nav.tasks'))) {
        return this.deny(ctx, 'create tasks');
      }
      const raw = ('text' in ctx.message ? ctx.message.text : '') as string;
      const title = raw.replace(/^\/newtask(?:@\S+)?\s*/i, '').trim();
      if (!title) {
        this.pending.set(ctx.chat.id, { kind: 'newtask' });
        return ctx.reply('What is the task title? (Send /cancel to abort.)');
      }
      return this.createTask(ctx, title);
    });

    // ── Inline-keyboard callbacks ──────────────────────────────────────────

    this.bot.action(/^task:done:(.+)$/, async (ctx) => {
      const user = (ctx.state as any).user as PrismaUser;
      if (!(await this.roles.hasCapability(user.role, 'nav.tasks'))) {
        return ctx.answerCbQuery('Not permitted', { show_alert: true });
      }
      const id = (ctx.match as RegExpMatchArray)[1];
      try {
        await this.tasks.update(id, { status: 'COMPLETED' });
        const original = (ctx.callbackQuery as any)?.message?.text ?? 'Task';
        await ctx.editMessageText(`✅ ${original}`);
        await ctx.answerCbQuery('Completed');
      } catch {
        await ctx.answerCbQuery('Already gone');
      }
    });

    this.bot.action(/^task:edit:(.+)$/, async (ctx) => {
      const user = (ctx.state as any).user as PrismaUser;
      if (!(await this.roles.hasCapability(user.role, 'nav.tasks'))) {
        return ctx.answerCbQuery('Not permitted', { show_alert: true });
      }
      const id = (ctx.match as RegExpMatchArray)[1];
      this.pending.set(ctx.chat!.id, { kind: 'edit', taskId: id });
      await ctx.answerCbQuery();
      await ctx.reply('Send the new title for this task. (Send /cancel to abort.)');
    });

    this.bot.action(/^task:delete:([0-9a-f-]+)$/, async (ctx) => {
      const user = (ctx.state as any).user as PrismaUser;
      if (!(await this.roles.hasCapability(user.role, 'action.delete'))) {
        return ctx.answerCbQuery('Your role cannot delete', { show_alert: true });
      }
      const id = (ctx.match as RegExpMatchArray)[1];
      await ctx.answerCbQuery();
      await ctx.reply(
        'Delete this task?',
        Markup.inlineKeyboard([
          Markup.button.callback('Yes, delete', `task:delete:confirm:${id}`),
          Markup.button.callback('Cancel', `task:delete:abort`),
        ]),
      );
    });

    this.bot.action(/^task:delete:confirm:(.+)$/, async (ctx) => {
      const user = (ctx.state as any).user as PrismaUser;
      if (!(await this.roles.hasCapability(user.role, 'action.delete'))) {
        return ctx.answerCbQuery('Your role cannot delete', { show_alert: true });
      }
      const id = (ctx.match as RegExpMatchArray)[1];
      try {
        await this.tasks.remove(id);
        await ctx.editMessageText('🗑 Deleted');
        await ctx.answerCbQuery('Deleted');
      } catch {
        await ctx.answerCbQuery('Already gone');
      }
    });

    this.bot.action('task:delete:abort', async (ctx) => {
      await ctx.editMessageText('Cancelled.');
      await ctx.answerCbQuery();
    });

    // ── Free-text capture for pending flows ────────────────────────────────
    // Commands are dispatched by Telegraf before this generic 'text' handler,
    // so '/cancel', '/newtask <title>' etc. don't fall through.
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;
      if (text.startsWith('/')) return;
      const flow = this.pending.get(ctx.chat.id);
      if (!flow) return;
      this.pending.delete(ctx.chat.id);
      const user = (ctx.state as any).user as PrismaUser;
      if (flow.kind === 'newtask') {
        if (!(await this.roles.hasCapability(user.role, 'nav.tasks'))) return this.deny(ctx, 'create tasks');
        return this.createTask(ctx, text.trim());
      }
      if (flow.kind === 'edit') {
        if (!(await this.roles.hasCapability(user.role, 'nav.tasks'))) return this.deny(ctx, 'edit tasks');
        try {
          await this.tasks.update(flow.taskId, { title: text.trim() });
          return ctx.reply(`✓ Renamed: ${text.trim()}`);
        } catch (e: any) {
          return ctx.reply(`❌ ${e?.message ?? 'Update failed'}`);
        }
      }
    });

    // ── Boot the bot transport ─────────────────────────────────────────────
    const domain = process.env.TELEGRAM_WEBHOOK_DOMAIN;
    try {
      if (domain) {
        const secret = process.env.TELEGRAM_WEBHOOK_SECRET || 'telegram';
        await this.bot.telegram.setWebhook(`${domain}/telegram/webhook/${secret}`);
        this.log.log('Telegram webhook registered');
      } else {
        this.bot.launch().catch((e) => this.log.error('long-poll launch failed', e));
        this.log.log('Telegram bot launched (long polling)');
      }
    } catch (e) {
      this.log.error(`Telegram bot setup failed (continuing without bot): ${(e as Error).message}`);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async createTask(ctx: any, title: string) {
    if (!title) return ctx.reply('Task title cannot be empty.');
    const dto = plainToInstance(CreateTaskDto, { title });
    const errors = await validate(dto);
    if (errors.length) {
      const msgs = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      return ctx.reply('❌ ' + msgs.join('; '));
    }
    const task = await this.tasks.create(dto);
    return ctx.reply(`✓ Created: ${task.title}`);
  }

  private deny(ctx: any, what: string) {
    return ctx.reply(`Your linked SimpleBooks role does not permit you to ${what}.`);
  }

  // ── Notifications ──────────────────────────────────────────────────────

  async notify(text: string): Promise<number> {
    if (!this.bot) return 0;
    const chats = await this.prisma.telegramChat.findMany({ select: { chatId: true } });
    let sent = 0;
    for (const { chatId } of chats) {
      try {
        await this.bot.telegram.sendMessage(chatId, text);
        sent += 1;
      } catch (e) {
        this.log.warn(`Telegram notify to ${chatId} failed: ${(e as Error).message}`);
      }
    }
    return sent;
  }

  async handleWebhook(secret: string, update: unknown) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET || 'telegram';
    if (!this.bot || secret !== expected) return { ok: false };
    await this.bot.handleUpdate(update as Parameters<Telegraf['handleUpdate']>[0]);
    return { ok: true };
  }

  async status() {
    const [allowlistCount, chatCount] = await Promise.all([
      this.prisma.telegramAllowlist.count(),
      this.prisma.telegramChat.count(),
    ]);
    return {
      tokenConfigured: this.tokenConfigured,
      botRunning: this.isEnabled,
      mode: process.env.TELEGRAM_WEBHOOK_DOMAIN ? 'webhook' : 'long-poll',
      webhookDomain: process.env.TELEGRAM_WEBHOOK_DOMAIN ?? null,
      allowlistCount,
      chatCount,
    };
  }

  async onModuleDestroy() {
    this.bot?.stop('SIGTERM');
  }
}
