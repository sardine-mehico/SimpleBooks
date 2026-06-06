import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MailConfigurationService } from './mail-configuration.service';
import { UpsertMailConfigurationDto } from './dto';
import { AdminOnly } from '../auth/roles.decorator';

@ApiTags('mail-configuration')
@AdminOnly()
@Controller('mail-configuration')
export class MailConfigurationController {
  constructor(private mail: MailConfigurationService) {}

  @Get() get() { return this.mail.get(); }
  @Put() save(@Body() dto: UpsertMailConfigurationDto) { return this.mail.save(dto); }
}
