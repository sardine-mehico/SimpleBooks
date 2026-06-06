import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TelegramAllowlistService } from './allowlist.service';
import { CreateAllowlistDto } from './allowlist.dto';
import { AdminOnly } from '../auth/roles.decorator';

@ApiTags('telegram/allowlist')
@AdminOnly()
@Controller('telegram/allowlist')
export class TelegramAllowlistController {
  constructor(private allowlist: TelegramAllowlistService) {}

  @Get() list() { return this.allowlist.list(); }
  @Post() create(@Body() dto: CreateAllowlistDto) { return this.allowlist.create(dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.allowlist.remove(id); }
}
