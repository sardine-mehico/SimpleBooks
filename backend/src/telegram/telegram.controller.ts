import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TelegramService } from './telegram.service';
import { Public } from '../auth/public.decorator';

@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  constructor(private telegram: TelegramService) {}

  @Get('status')
  status() {
    return this.telegram.status();
  }

  // The Telegram webhook is authenticated by the URL-embedded shared secret
  // and must remain reachable without a SimpleBooks login.
  @Public()
  @Post('webhook/:secret')
  webhook(@Param('secret') secret: string, @Body() update: unknown) {
    return this.telegram.handleWebhook(secret, update);
  }
}
