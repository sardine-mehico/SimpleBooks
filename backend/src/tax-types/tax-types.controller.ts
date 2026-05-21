import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { TaxTypesService } from './tax-types.service';
import { CreateTaxTypeDto, UpdateTaxTypeDto } from './dto';

@Controller('tax-types')
export class TaxTypesController {
  constructor(private taxTypes: TaxTypesService) {}

  @Get() list() { return this.taxTypes.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.taxTypes.get(id); }
  @Post() create(@Body() dto: CreateTaxTypeDto) { return this.taxTypes.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateTaxTypeDto) { return this.taxTypes.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.taxTypes.remove(id); }
}
