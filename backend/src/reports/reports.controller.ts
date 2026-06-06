// backend/src/reports/reports.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportQueryDto, TagsReportQueryDto, CashflowQueryDto } from './dto';
import { Capability } from '../auth/roles.decorator';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('expense')
  @Capability('nav.expense_report')
  expense(@Query() q: ReportQueryDto) {
    return this.service.getReport('EXPENSE', q);
  }

  @Get('income')
  @Capability('nav.income_report')
  income(@Query() q: ReportQueryDto) {
    return this.service.getReport('INCOME', q);
  }

  @Get('tags')
  @Capability('nav.tags_report')
  tags(@Query() q: TagsReportQueryDto) {
    return this.service.getTagsReport(q);
  }

  @Get('cashflow')
  @Capability('nav.cashflow')
  cashflow(@Query() q: CashflowQueryDto) {
    return this.service.getCashflow(q);
  }
}
