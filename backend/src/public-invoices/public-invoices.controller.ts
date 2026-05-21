import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PublicInvoicesService } from './public-invoices.service';
import { PdfService } from '../pdf/pdf.service';

// Unauthenticated customer-facing endpoints. The token is the only
// authentication — anyone with the URL sees the invoice, by design. Matches
// the rest of the backend's no-guards posture; status guards in the service
// keep DRAFT / VOID / FAILED_TO_SEND invoices from leaking through.
@Controller('public/invoices')
export class PublicInvoicesController {
  constructor(
    private readonly publicInvoices: PublicInvoicesService,
    private readonly pdf: PdfService,
  ) {}

  @Get(':token')
  getByToken(@Param('token') token: string) {
    return this.publicInvoices.getByToken(token);
  }

  // Force-download the PDF (Content-Disposition: attachment). The button on
  // the public page is labelled "Download PDF" — `attachment` makes the
  // browser save the file rather than open it inline, matching that verb.
  @Get(':token/pdf')
  @Header('Content-Type', 'application/pdf')
  async renderPdf(@Param('token') token: string, @Res() res: Response) {
    const invoiceId = await this.publicInvoices.resolveInvoiceId(token);
    const { buffer, filename } = await this.pdf.renderInvoice(invoiceId);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.end(buffer);
  }
}
