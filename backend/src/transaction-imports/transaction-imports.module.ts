import { Module } from '@nestjs/common';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';
import { TransactionImportsController } from './transaction-imports.controller';
import { TransactionImportsService } from './transaction-imports.service';

@Module({
  imports: [RuleEngineModule],
  controllers: [TransactionImportsController],
  providers: [TransactionImportsService],
  exports: [TransactionImportsService],
})
export class TransactionImportsModule {}
