import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { StatementsService } from './statements.service';
import { PdfService } from '../pdf/pdf.service';
import { StatementQueryDto } from './dto';

@Controller('statements')
export class StatementsController {
  constructor(
    private statements: StatementsService,
    private pdf: PdfService,
  ) {}

  @Get()
  get(@Query() q: StatementQueryDto) {
    return this.statements.getStatement({
      customerId: q.customerId,
      billingCompanyId: q.billingCompanyId,
      dateFrom: q.dateFrom ?? null,
      dateTo: q.dateTo ?? null,
    });
  }

  @Get('pdf')
  @Header('Content-Type', 'application/pdf')
  async renderPdf(@Query() q: StatementQueryDto, @Res() res: Response) {
    const payload = await this.statements.getStatement({
      customerId: q.customerId,
      billingCompanyId: q.billingCompanyId,
      dateFrom: q.dateFrom ?? null,
      dateTo: q.dateTo ?? null,
    });
    const { buffer, filename } = await this.pdf.renderStatement({
      customer: {
        customerNumber: payload.customer.customerNumber,
        name: payload.customer.name,
        address: payload.customer.address,
        billingEmail1: payload.customer.billingEmail1,
      },
      billingCompany: {
        name: payload.billingCompany.name,
        abn: payload.billingCompany.abn,
        address: payload.billingCompany.address,
        accountsEmail: payload.billingCompany.accountsEmail,
      },
      dateFrom: payload.dateFrom,
      dateTo: payload.dateTo,
      openingBalance: payload.openingBalance,
      rows: payload.rows,
      summary: payload.summary,
    });
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.end(buffer);
  }
}
