import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { RetentionService } from './retention.service';
import { RetentionController } from './retention.controller';
import { RetentionProcessor } from './retention.processor';
import { RETENTION_QUEUE } from './retention.constants';

@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: RETENTION_QUEUE })],
  controllers: [RetentionController],
  providers: [RetentionService, RetentionProcessor],
  exports: [RetentionService],
})
export class RetentionModule implements OnModuleInit {
  private readonly log = new Logger(RetentionModule.name);
  constructor(@InjectQueue(RETENTION_QUEUE) private queue: Queue) {}

  async onModuleInit() {
    // Daily sweep at 03:15 local time. Cron tz defaults to UTC; that's fine
    // here — the cutoff is a duration, not a wall-clock time, so the only
    // effect of timezone choice is which hour of UTC the job runs at.
    this.log.log('Scheduling daily auto-purge sweep at 03:15');
    await this.queue.add(
      'sweep',
      {},
      {
        repeat: { pattern: '15 3 * * *' },
        removeOnComplete: 30,
        removeOnFail: 30,
        jobId: 'retention-sweep',
      },
    );
  }
}
