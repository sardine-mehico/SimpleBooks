import { Body, Controller, Delete, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto';

@Controller('companies')
export class CompaniesController {
  constructor(private companies: CompaniesService) {}

  @Get() list() { return this.companies.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.companies.get(id); }
  @Post() create(@Body() dto: CreateCompanyDto) { return this.companies.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateCompanyDto, @Headers('if-match') ifMatch?: string) { return this.companies.update(id, dto, ifMatch); }
  @Delete(':id') remove(@Param('id') id: string) { return this.companies.remove(id); }
}
