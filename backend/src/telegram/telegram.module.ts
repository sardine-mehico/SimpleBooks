import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramAllowlistService } from './allowlist.service';
import { TelegramAllowlistController } from './allowlist.controller';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [TelegramController, TelegramAllowlistController],
  providers: [TelegramService, TelegramAllowlistService],
  exports: [TelegramService],
})
export class TelegramModule {}
