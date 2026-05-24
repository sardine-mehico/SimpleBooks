// backend/src/payments/payments.module.ts
import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { runPaymentsBackfill } from './backfill';
import { PaymentsService } from './payments.service';

@Module({
  imports: [PrismaModule],
  providers: [PaymentsService],
  controllers: [],
  exports: [PaymentsService],
})
export class PaymentsModule implements OnModuleInit {
  constructor(private prisma: PrismaService) {}
  async onModuleInit() {
    // One-shot, idempotent. The WHERE clause inside the SQL guards against re-running.
    await runPaymentsBackfill(this.prisma);
  }
}
