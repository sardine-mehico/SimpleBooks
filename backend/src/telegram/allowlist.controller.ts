import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TelegramAllowlistService } from './allowlist.service';
import { CreateAllowlistDto, UpdateAllowlistDto } from './allowlist.dto';
import { AdminOnly } from '../auth/roles.decorator';

@ApiTags('telegram/allowlist')
@AdminOnly()
@Controller('telegram/allowlist')
export class TelegramAllowlistController {
  constructor(private allowlist: TelegramAllowlistService) {}

  @Get() list() { return this.allowlist.list(); }
  @Post() create(@Body() dto: CreateAllowlistDto) { return this.allowlist.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateAllowlistDto) {
    return this.allowlist.update(id, dto);
  }
  @Delete(':id') remove(@Param('id') id: string) { return this.allowlist.remove(id); }
}
