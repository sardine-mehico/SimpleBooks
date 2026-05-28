import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { RuleEngineService } from './rule-engine.service';
import { RecategoriseDto, TestRulesDto } from './dto';

@Controller('rule-engine')
export class RuleEngineController {
  constructor(private engine: RuleEngineService) {}

  @Post('recategorise')
  @HttpCode(200)
  recategorise(@Body() dto: RecategoriseDto) {
    return this.engine.run({
      filter: {
        scope: dto.scope,
        accountIds: dto.accountIds,
        dateFrom: dto.dateFrom,
        dateTo: dto.dateTo,
      },
      preserveSplits: dto.preserveSplits ?? true,
      applyRules: true,
      dryRun: false,
    });
  }

  @Post('test')
  @HttpCode(200)
  test(@Body() dto: TestRulesDto) {
    return this.engine.run({
      filter: dto.source === 'existing'
        ? { scope: 'all', accountIds: dto.accountIds, dateFrom: dto.dateFrom, dateTo: dto.dateTo }
        : undefined,
      csvRows: dto.source === 'csv' ? dto.csvRows : undefined,
      ruleIds: dto.ruleIds,
      preserveSplits: true,
      applyRules: true,
      dryRun: true,
    });
  }
}
