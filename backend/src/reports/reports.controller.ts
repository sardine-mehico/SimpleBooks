// backend/src/reports/reports.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportQueryDto, TagsReportQueryDto } from './dto';

@Controller('reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('expense')
  expense(@Query() q: ReportQueryDto) {
    return this.service.getReport('EXPENSE', q);
  }

  @Get('income')
  income(@Query() q: ReportQueryDto) {
    return this.service.getReport('INCOME', q);
  }

  @Get('tags')
  tags(@Query() q: TagsReportQueryDto) {
    return this.service.getTagsReport(q);
  }
}
