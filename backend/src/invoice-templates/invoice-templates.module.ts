import { Module } from '@nestjs/common';
import { InvoiceTemplatesController } from './invoice-templates.controller';
import { InvoiceTemplatesService } from './invoice-templates.service';

@Module({
  controllers: [InvoiceTemplatesController],
  providers: [InvoiceTemplatesService],
  exports: [InvoiceTemplatesService],
})
export class InvoiceTemplatesModule {}
