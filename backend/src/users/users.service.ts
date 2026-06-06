import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../auth/password';
import { CreateUserDto, UpdateUserDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      orderBy: [{ isActive: 'desc' }, { displayName: 'asc' }],
      select: this.publicSelect(),
    });
  }

  async get(id: string) {
    const row = await this.prisma.user.findUnique({ where: { id }, select: this.publicSelect() });
    if (!row) throw new NotFoundException('User not found.');
    return row;
  }

  async create(dto: CreateUserDto) {
    if (dto.role !== 'API_USER' && !dto.password) {
      throw new BadRequestException('Password is required for non-API users.');
    }
    if (dto.role === 'API_USER' && dto.password) {
      // API users authenticate via key; allowing a password creates a
      // confusing dual-credential surface.
      throw new BadRequestException('API users do not have passwords; create an API key instead.');
    }
    const passwordHash = dto.password ? await hashPassword(dto.password) : null;
    try {
      return await this.prisma.user.create({
        data: {
          username: dto.username,
          displayName: dto.displayName,
          email: dto.email,
          role: dto.role,
          passwordHash,
          isActive: dto.isActive ?? true,
        },
        select: this.publicSelect(),
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Username or email already in use.');
      }
      throw e;
    }
  }

  async update(actorId: string, id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found.');

    // Admin self-protection: you can't change your own role or deactivate yourself.
    if (actorId === id) {
      if (dto.role !== undefined && dto.role !== existing.role) {
        throw new ForbiddenException('You cannot change your own role.');
      }
      if (dto.isActive === false) {
        throw new ForbiddenException('You cannot deactivate yourself.');
      }
    }

    // Block demoting the last ADMIN.
    if (existing.role === 'ADMIN' && dto.role && dto.role !== 'ADMIN') {
      const adminCount = await this.prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (adminCount <= 1) {
        throw new ForbiddenException('Cannot remove the last active admin.');
      }
    }
    if (existing.role === 'ADMIN' && dto.isActive === false) {
      const adminCount = await this.prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (adminCount <= 1) {
        throw new ForbiddenException('Cannot deactivate the last active admin.');
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password !== undefined) data.passwordHash = await hashPassword(dto.password);

    try {
      return await this.prisma.user.update({ where: { id }, data, select: this.publicSelect() });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Username or email already in use.');
      }
      throw e;
    }
  }

  async remove(actorId: string, id: string) {
    if (actorId === id) {
      throw new ForbiddenException('You cannot delete yourself.');
    }
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found.');

    // Env admin row reconciles itself on every boot — deleting it has no
    // long-term effect and would log out the env admin until restart.
    if (existing.username === process.env.ADMIN_USERNAME) {
      throw new ForbiddenException('Cannot delete the env-managed admin.');
    }

    if (existing.role === 'ADMIN') {
      const adminCount = await this.prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (adminCount <= 1) {
        throw new ForbiddenException('Cannot delete the last active admin.');
      }
    }

    await this.prisma.user.delete({ where: { id } });
    return { id };
  }

  private publicSelect() {
    return {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      lockedUntil: true,
      failedLoginAttempts: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }
}
