import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { AiCategoriserService } from './ai-categoriser.service';
import { AiRuleDrafterService } from './ai-rule-drafter.service';
import { ApplyDto, BulkSuggestDto, SuggestCategoryDto } from './ai.dto';

@Controller('ai')
export class AiController {
  constructor(
    private categoriser: AiCategoriserService,
    private drafter: AiRuleDrafterService,
  ) {}

  @Post('suggest-category')
  @HttpCode(200)
  suggest(@Body() dto: SuggestCategoryDto) {
    return this.categoriser.suggest(dto.transactionId, { force: dto.force });
  }

  @Post('apply')
  @HttpCode(204)
  async apply(@Body() dto: ApplyDto): Promise<void> {
    await this.categoriser.apply(dto.transactionId, dto.decision as any);
  }

  @Post('bulk-suggest')
  @HttpCode(200)
  bulk(@Body() dto: BulkSuggestDto) {
    return this.categoriser.bulkSuggest(dto);
  }

  @Get('bulk-suggest/:runId/status')
  bulkStatus(@Param('runId') runId: string) {
    return this.categoriser.getBulkStatus(runId);
  }

  @Post('bulk-suggest/:runId/cancel')
  @HttpCode(204)
  bulkCancel(@Param('runId') runId: string) {
    this.categoriser.cancelBulk(runId);
  }

  @Get('review-queue/count')
  queueCount() {
    return this.categoriser.reviewQueueCount();
  }

  @Get('review-queue')
  queue() {
    return this.categoriser.listReviewQueue();
  }

  @Post('mine-rules')
  @HttpCode(200)
  mine() {
    return this.drafter.mine();
  }
}
