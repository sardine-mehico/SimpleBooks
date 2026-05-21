import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { InvoicesService } from './invoices.service';
import {
  CreateInvoiceDto,
  DeleteInvoiceDto,
  SendInvoiceDto,
  UpdateInvoiceDto,
  VoidInvoiceDto,
} from './dto';
import { InvoiceMailService } from '../mail/invoice-mail.service';
import { PdfService } from '../pdf/pdf.service';

@Controller('invoices')
export class InvoicesController {
  constructor(
    private invoices: InvoicesService,
    private invoiceMail: InvoiceMailService,
    private pdf: PdfService,
  ) {}

  @Get() list() { return this.invoices.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.invoices.get(id); }
  @Post() create(@Body() dto: CreateInvoiceDto) { return this.invoices.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) { return this.invoices.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string, @Body() dto: DeleteInvoiceDto) { return this.invoices.remove(id, dto.reason); }

  // Manual "Send Invoice" trigger. Always returns 2xx — the body shape tells
  // the UI whether the send succeeded synchronously, queued retries, or hit a
  // not-found. The Send Invoice dialog posts the user-edited From / To / CC /
  // BCC / Subject / HTML / text; any omitted fields fall back to the assigned
  // EmailTemplate (via /send-context) and the billing-company routing.
  @Post(':id/send')
  send(@Param('id') id: string, @Body() dto: SendInvoiceDto) {
    return this.invoiceMail.send(id, dto ?? {});
  }

  // Pre-fill payload for the Send Invoice dialog. Returns the From / To /
  // CC / BCC / Subject / Body / Text values that the dialog inputs should
  // open with, already token-substituted against this invoice's context.
  @Get(':id/send-context')
  sendContext(@Param('id') id: string) {
    return this.invoices.sendContext(id);
  }

  @Post(':id/clone')
  clone(@Param('id') id: string) {
    return this.invoices.clone(id);
  }

  @Post(':id/void')
  void(@Param('id') id: string, @Body() dto: VoidInvoiceDto) {
    return this.invoices.void(id, dto.reason);
  }

  // Render and stream the invoice PDF. `inline` content-disposition lets the
  // browser display it directly when the user clicks the PDF button.
  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  async renderPdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.pdf.renderInvoice(id);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.end(buffer);
  }
}
