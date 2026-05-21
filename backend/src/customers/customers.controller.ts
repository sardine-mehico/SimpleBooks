import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto';

@Controller('customers')
export class CustomersController {
  constructor(private customers: CustomersService) {}

  @Get() list() { return this.customers.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.customers.get(id); }
  @Post() create(@Body() dto: CreateCustomerDto) { return this.customers.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) { return this.customers.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.customers.remove(id); }
}
