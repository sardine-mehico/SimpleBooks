import { Module } from '@nestjs/common';
import { RuleEngineController } from './rule-engine.controller';
import { RuleEngineService } from './rule-engine.service';

@Module({
  controllers: [RuleEngineController],
  providers: [RuleEngineService],
  exports: [RuleEngineService],
})
export class RuleEngineModule {}
