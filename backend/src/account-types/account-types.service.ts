import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountTypeDto, UpdateAccountTypeDto } from './dto';

@Injectable()
export class AccountTypesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.accountType.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async get(id: string) {
    const row = await this.prisma.accountType.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  create(data: CreateAccountTypeDto) {
    return this.prisma.accountType.create({
      data: { ...data, isActive: data.isActive ?? true },
    });
  }

  async update(id: string, data: UpdateAccountTypeDto) {
    await this.get(id);
    return this.prisma.accountType.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.get(id);
    const inUse = await this.prisma.account.count({ where: { accountTypeId: id } });
    if (inUse > 0) {
      throw new ConflictException(
        `Cannot delete: ${inUse} account${inUse === 1 ? '' : 's'} reference this type. Reassign them first.`,
      );
    }
    await this.prisma.accountType.delete({ where: { id } });
    return { ok: true };
  }
}
