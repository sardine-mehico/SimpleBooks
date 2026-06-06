import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto';
import { PaymentsService } from '../payments/payments.service';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private customers: CustomersService, private payments: PaymentsService) {}

  @Get() list() { return this.customers.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.customers.get(id); }
  @Get(':id/credit')
  credit(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.payments.getCustomerCredit(id);
  }
  @Post() create(@Body() dto: CreateCustomerDto) { return this.customers.create(dto); }
  @Patch(':id') update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.customers.update(id, dto, ifMatch);
  }
  @Delete(':id') remove(@Param('id') id: string) { return this.customers.remove(id); }
}
