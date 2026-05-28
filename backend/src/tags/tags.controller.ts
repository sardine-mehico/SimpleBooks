import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagDto, UpdateTagDto } from './dto';

@Controller('tags')
export class TagsController {
  constructor(private service: TagsService) {}

  @Get() list(@Query('includeInactive') includeInactive?: string) {
    return this.service.list(includeInactive === 'true');
  }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateTagDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateTagDto) { return this.service.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }

  // Apply tags using auto-alias to ALL transactions in the database. Surfaced
  // as a button on /settings/tags so the user can re-scan after editing aliases.
  @Post('auto-apply')
  @HttpCode(200)
  autoApplyAll() {
    return this.service.autoAliasApply();
  }

  // Apply auto-alias for a single tag against all transactions. Surfaced as
  // an "Apply to existing transactions" button on each tag's edit form.
  @Post(':id/auto-apply')
  @HttpCode(200)
  autoApplyOne(@Param('id') id: string) {
    return this.service.autoAliasApply({ onlyTagId: id });
  }
}
