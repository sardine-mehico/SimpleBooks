import { Module } from '@nestjs/common';
import { PublicInvoicesController } from './public-invoices.controller';
import { PublicInvoicesService } from './public-invoices.service';
import { PreviewController } from './preview.controller';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [PdfModule],
  controllers: [PublicInvoicesController, PreviewController],
  providers: [PublicInvoicesService],
})
export class PublicInvoicesModule {}
