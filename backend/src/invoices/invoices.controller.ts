import { BadRequestException, Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PDFDocument } from 'pdf-lib';
import { InvoicesService } from './invoices.service';
import {
  BulkIdsDto,
  CreateInvoiceDto,
  DeleteInvoiceDto,
  SendInvoiceDto,
  UpdateInvoiceDto,
  VoidInvoiceDto,
} from './dto';
import { InvoiceMailService } from '../mail/invoice-mail.service';
import { PdfService } from '../pdf/pdf.service';
import { pLimit } from '../ai/utils/p-limit';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(
    private invoices: InvoicesService,
    private invoiceMail: InvoiceMailService,
    private pdf: PdfService,
    private prisma: PrismaService,
  ) {}

  @Get() list(
    @Query('openOnly') openOnly?: string,
    @Query('search') search?: string,
  ) {
    if (openOnly === 'true' || search) {
      return this.invoices.list({ openOnly: openOnly === 'true', search });
    }
    return this.invoices.list();
  }

  // Trash endpoints — literal paths must come BEFORE the `:id` routes so
  // Nest doesn't try to match `:id = "trash"`.
  @Get('trash')
  listTrash() {
    return this.invoices.listTrash();
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id') id: string) {
    return this.invoices.restore(id);
  }

  @Delete(':id/purge')
  @HttpCode(200)
  purge(@Param('id') id: string) {
    return this.invoices.purge(id);
  }

  // Concatenate PDFs for a set of invoices into a single downloadable file.
  @Post('bulk-pdf')
  @Header('Content-Type', 'application/pdf')
  async bulkPdf(@Body() dto: BulkIdsDto, @Res() res: Response) {
    if (!dto.ids?.length) throw new BadRequestException('ids required');
    const buffers: Buffer[] = [];
    for (const id of dto.ids) {
      const { buffer } = await this.pdf.renderInvoice(id);
      buffers.push(buffer);
    }
    const out = await PDFDocument.create();
    for (const buf of buffers) {
      const src = await PDFDocument.load(buf);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    }
    const bytes = await out.save();
    const combined = Buffer.from(bytes);
    const filename = `invoices-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(combined.length));
    res.end(combined);
  }

  // Send each invoice in the set via the existing mail flow (concurrency cap 3).
  @Post('bulk-send')
  @HttpCode(200)
  async bulkSend(@Body() dto: BulkIdsDto) {
    if (!dto.ids?.length) return { sent: [], failed: [] };
    const limit = pLimit(3);
    const sent: Array<{ id: string; invoiceNumber: number }> = [];
    const failed: Array<{ id: string; invoiceNumber: number; error: string }> = [];
    await Promise.all(
      dto.ids.map((id) =>
        limit(async () => {
          try {
            const inv = await this.prisma.invoice.findUnique({
              where: { id },
              select: { invoiceNumber: true },
            });
            await this.invoiceMail.send(id, {});
            sent.push({ id, invoiceNumber: inv?.invoiceNumber ?? 0 });
          } catch (e: any) {
            const inv = await this.prisma.invoice
              .findUnique({ where: { id }, select: { invoiceNumber: true } })
              .catch(() => null);
            failed.push({ id, invoiceNumber: inv?.invoiceNumber ?? 0, error: e?.message ?? String(e) });
          }
        }),
      ),
    );
    return { sent, failed };
  }

  @Get(':id') get(@Param('id') id: string) { return this.invoices.get(id); }
  @Post() create(@Body() dto: CreateInvoiceDto) { return this.invoices.create(dto); }
  @Patch(':id') update(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.invoices.update(id, dto, ifMatch);
  }
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
