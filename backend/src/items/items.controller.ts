import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ItemsService } from './items.service';
import { CreateItemDto, UpdateItemDto } from './dto';

@Controller('items')
export class ItemsController {
  constructor(private items: ItemsService) {}

  @Get() list() { return this.items.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.items.get(id); }
  @Post() create(@Body() dto: CreateItemDto) { return this.items.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateItemDto) { return this.items.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.items.remove(id); }
}
