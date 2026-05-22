import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AiProvidersService } from './ai-providers.service';
import { CreateAiProviderDto, MoveAiProviderDto, UpdateAiProviderDto } from './dto';

@Controller('ai-providers')
export class AiProvidersController {
  constructor(private service: AiProvidersService) {}

  @Get() list() { return this.service.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateAiProviderDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateAiProviderDto) { return this.service.update(id, dto); }
  @Patch(':id/set-primary') setPrimary(@Param('id') id: string) { return this.service.setPrimary(id); }
  @Patch(':id/move') move(@Param('id') id: string, @Body() dto: MoveAiProviderDto) { return this.service.move(id, dto.direction); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}
