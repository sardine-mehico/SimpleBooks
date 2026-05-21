import { Body, Controller, Get, Put } from '@nestjs/common';
import { MailConfigurationService } from './mail-configuration.service';
import { UpsertMailConfigurationDto } from './dto';

@Controller('mail-configuration')
export class MailConfigurationController {
  constructor(private mail: MailConfigurationService) {}

  @Get() get() { return this.mail.get(); }
  @Put() save(@Body() dto: UpsertMailConfigurationDto) { return this.mail.save(dto); }
}
