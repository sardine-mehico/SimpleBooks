import { Module } from '@nestjs/common';
import { RuleEngineController } from './rule-engine.controller';
import { RuleEngineService } from './rule-engine.service';
import { TagsModule } from '../tags/tags.module';

@Module({
  imports: [TagsModule],
  controllers: [RuleEngineController],
  providers: [RuleEngineService],
  exports: [RuleEngineService],
})
export class RuleEngineModule {}
