import { Module } from '@nestjs/common';
import { TransactionImportsController } from './transaction-imports.controller';
import { TransactionImportsService } from './transaction-imports.service';

@Module({
  controllers: [TransactionImportsController],
  providers: [TransactionImportsService],
  exports: [TransactionImportsService],
})
export class TransactionImportsModule {}
