import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAllowlistDto } from './allowlist.dto';

export const normalizeUsername = (u: string) => u.trim().replace(/^@/, '').toLowerCase();

@Injectable()
export class TelegramAllowlistService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.telegramAllowlist.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(data: CreateAllowlistDto) {
    try {
      return await this.prisma.telegramAllowlist.create({
        data: {
          username: normalizeUsername(data.username),
          user: data.user,
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

  async isAllowed(rawUsername: string | undefined | null) {
    if (!rawUsername) return false;
    const username = normalizeUsername(rawUsername);
    const hit = await this.prisma.telegramAllowlist.findUnique({ where: { username } });
    return !!hit;
  }
}
