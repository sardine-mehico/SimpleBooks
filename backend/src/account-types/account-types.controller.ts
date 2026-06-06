import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccountTypesService } from './account-types.service';
import { CreateAccountTypeDto, UpdateAccountTypeDto } from './dto';

@ApiTags('account-types')
@Controller('account-types')
export class AccountTypesController {
  constructor(private service: AccountTypesService) {}

  @Get() list() { return this.service.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateAccountTypeDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateAccountTypeDto) { return this.service.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}
