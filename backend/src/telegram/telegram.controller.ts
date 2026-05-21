import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TelegramService } from './telegram.service';

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
