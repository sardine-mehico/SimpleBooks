import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ResendService } from './resend.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  providers: [NotificationsService, ResendService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
