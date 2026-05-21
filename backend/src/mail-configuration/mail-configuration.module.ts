import { Module } from '@nestjs/common';
import { MailConfigurationController } from './mail-configuration.controller';
import { MailConfigurationService } from './mail-configuration.service';

@Module({
  controllers: [MailConfigurationController],
  providers: [MailConfigurationService],
  exports: [MailConfigurationService],
})
export class MailConfigurationModule {}
