import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Telegraf, Markup } from 'telegraf';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { CreateTaskDto } from '../tasks/dto';
import { TelegramAllowlistService } from './allowlist.service';

const STATUS_EMOJI: Record<string, string> = {
  PENDING: '⏳',
  IN_PROGRESS: '🔵',
  COMPLETED: '✅',
  CANCELLED: '⛔',
};

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;

  constructor(
    private prisma: PrismaService,
    private tasks: TasksService,
    private allowlist: TelegramAllowlistService,
  ) {}

  get isEnabled() {
    return !!this.bot;
  }

  get tokenConfigured() {
    return !!process.env.TELEGRAM_BOT_TOKEN;
  }

  async onModuleInit() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      this.log.warn('TELEGRAM_BOT_TOKEN unset — Telegram bot disabled');
      return;
    }
    this.bot = new Telegraf(token);

    // Allowlist gate — runs before every handler.
    this.bot.use(async (ctx, next) => {
      const username = ctx.from?.username;
      if (!username) {
        return ctx.reply(
          'Please set a public Telegram username on your account before using SimpleBooks.',
        );
      }
      const allowed = await this.allowlist.isAllowed(username);
      if (!allowed) {
        this.log.warn(`Rejected @${username} (not on allowlist)`);
        return ctx.reply(
          `Sorry, @${username} is not authorized. Ask an admin to add you to the SimpleBooks allowlist.`,
        );
      }
      return next();
    });

    this.bot.start(async (ctx) => {
      await this.prisma.telegramChat.upsert({
        where: { chatId: String(ctx.chat.id) },
        update: { username: ctx.from?.username },
        create: { chatId: String(ctx.chat.id), username: ctx.from?.username },
      });
      await ctx.reply(
        `Connected as @${ctx.from?.username}. Type /help to see commands.`,
      );
    });

    this.bot.help((ctx) =>
      ctx.reply(
        [
          'Commands:',
          '/tasks — list open tasks',
          '/newtask <title> — create a task',
          '/help — this message',
          '',
          'Tip: on /tasks each item has buttons to complete or cancel.',
        ].join('\n'),
      ),
    );

    this.bot.command('tasks', async (ctx) => {
      const tasks = await this.tasks.list();
      const open = tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
      if (open.length === 0) return ctx.reply('No open tasks.');
      await ctx.reply(`${open.length} open task(s):`);
      for (const t of open) {
        await ctx.reply(
          `${STATUS_EMOJI[t.status]} ${t.title}`,
          Markup.inlineKeyboard([
            Markup.button.callback('✓ Complete', `task:done:${t.id}`),
            Markup.button.callback('✗ Cancel', `task:cancel:${t.id}`),
          ]),
        );
      }
    });

    this.bot.command('newtask', async (ctx) => {
      const raw = ('text' in ctx.message ? ctx.message.text : '') as string;
      const title = raw.replace(/^\/newtask(?:@\S+)?\s*/i, '').trim();
      if (!title) return ctx.reply('Usage: /newtask <title>');

      // Run the SAME validation the HTTP API uses.
      const dto = plainToInstance(CreateTaskDto, { title });
      const errors = await validate(dto);
      if (errors.length) {
        const msgs = errors.flatMap((e) => Object.values(e.constraints ?? {}));
        return ctx.reply('❌ ' + msgs.join('; '));
      }

      const task = await this.tasks.create(dto);
      return ctx.reply(`✓ Created: ${task.title}`);
    });

    this.bot.action(/^task:done:(.+)$/, async (ctx) => {
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

    this.bot.action(/^task:cancel:(.+)$/, async (ctx) => {
      const id = (ctx.match as RegExpMatchArray)[1];
      try {
        await this.tasks.update(id, { status: 'CANCELLED' });
        const original = (ctx.callbackQuery as any)?.message?.text ?? 'Task';
        await ctx.editMessageText(`⛔ ${original}`);
        await ctx.answerCbQuery('Cancelled');
      } catch {
        await ctx.answerCbQuery('Already gone');
      }
    });

    // Network/Telegram-side failures must never crash the backend boot.
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
      this.log.error(
        `Telegram bot setup failed (continuing without bot): ${(e as Error).message}`,
      );
    }
  }

  // Broadcast a notification to every connected Telegram chat (anyone who has
  // run /start with the bot). Best-effort: per-chat errors are logged and
  // swallowed so a single bad chatId doesn't kill the rest. Returns the count
  // of successful sends. No-ops when the bot wasn't configured at boot.
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
    const allowlistCount = await this.prisma.telegramAllowlist.count();
    const chatCount = await this.prisma.telegramChat.count();
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
