import { Body, Controller, Get, Header, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { StatementsService } from './statements.service';
import { PdfService } from '../pdf/pdf.service';
import { SendStatementDto, StatementQueryDto } from './dto';

@ApiTags('statements')
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

  @Get('send-context')
  sendContext(@Query() q: StatementQueryDto) {
    return this.statements.getSendContext({
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

  @Post('send')
  send(@Body() dto: SendStatementDto) {
    return this.statements.send(
      {
        customerId: dto.customerId,
        billingCompanyId: dto.billingCompanyId,
        dateFrom: dto.dateFrom ?? null,
        dateTo: dto.dateTo ?? null,
      },
      {
        from: dto.fromEmail,
        to: dto.toEmail,
        cc: dto.ccEmail,
        bcc: dto.bccEmail,
        subject: dto.subject,
        html: dto.html,
      },
    );
  }
}
