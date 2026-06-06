import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAllowlistDto } from './allowlist.dto';

export const normalizeUsername = (u: string) => u.trim().replace(/^@/, '').toLowerCase();

@Injectable()
export class TelegramAllowlistService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.telegramAllowlist.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, username: true, displayName: true, role: true, isActive: true } } },
    });
  }

  async create(data: CreateAllowlistDto) {
    const linkedUser = await this.prisma.user.findUnique({ where: { id: data.userId } });
    if (!linkedUser) throw new BadRequestException('Linked user not found.');
    try {
      return await this.prisma.telegramAllowlist.create({
        data: {
          username: normalizeUsername(data.username),
          userId: data.userId,
          botName: data.botName,
          botToken: data.botToken,
          note: data.note,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('That username is already on the allowlist.');
      }
      throw e;
    }
  }

  async remove(id: string) {
    const row = await this.prisma.telegramAllowlist.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    await this.prisma.telegramAllowlist.delete({ where: { id } });
    return { ok: true };
  }

  // Look up an allowlisted Telegram username and return the linked
  // SimpleBooks user (or null if not allowed). The bot uses this to derive
  // the actor on every incoming message.
  async resolveUser(rawUsername: string | undefined | null) {
    if (!rawUsername) return null;
    const username = normalizeUsername(rawUsername);
    const hit = await this.prisma.telegramAllowlist.findUnique({
      where: { username },
      include: { user: true },
    });
    if (!hit) return null;
    if (!hit.user || !hit.user.isActive) return null;
    return hit.user;
  }
}
