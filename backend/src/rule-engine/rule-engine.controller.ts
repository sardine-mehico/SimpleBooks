import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RuleEngineService } from './rule-engine.service';
import { TagsService } from '../tags/tags.service';
import { RecategoriseDto, TestRulesDto } from './dto';

@ApiTags('rule-engine')
@Controller('rule-engine')
export class RuleEngineController {
  constructor(private engine: RuleEngineService, private tags: TagsService) {}

  @Post('recategorise')
  @HttpCode(200)
  async recategorise(@Body() dto: RecategoriseDto) {
    const result = await this.engine.run({
      filter: {
        scope: dto.scope ?? 'uncategorised',
        accountIds: dto.accountIds,
        dateFrom: dto.dateFrom,
        dateTo: dto.dateTo,
      },
      preserveSplits: dto.preserveSplits ?? true,
      applyRules: true,
      dryRun: false,
    });

    let autoAlias: { scanned: number; applied: number } | null = null;
    if (dto.applyAutoAlias !== false) {
      const txIds = result.rows.map((r) => r.transactionId);
      autoAlias = await this.tags.autoAliasApply(txIds.length > 0 ? { transactionIds: txIds } : {});
    }

    return { ...result, autoAlias };
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
