import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './dto';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private service: AccountsService) {}

  @Get() list(@Query('includeInactive') includeInactive?: string) {
    return this.service.list(includeInactive === 'true');
  }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateAccountDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateAccountDto) { return this.service.update(id, dto); }
  @Patch(':id/archive') archive(@Param('id') id: string) { return this.service.archive(id); }
  @Patch(':id/restore') restore(@Param('id') id: string) { return this.service.restore(id); }
}
