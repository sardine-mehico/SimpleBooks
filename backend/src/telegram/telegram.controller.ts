import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TelegramService } from './telegram.service';

@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  constructor(private telegram: TelegramService) {}

  @Get('status')
  status() {
    return this.telegram.status();
  }

  @Post('webhook/:secret')
  webhook(@Param('secret') secret: string, @Body() update: unknown) {
    return this.telegram.handleWebhook(secret, update);
  }
}
