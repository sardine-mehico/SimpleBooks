import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { CustomerLinkerService } from './customer-linker.service';
import { TagsModule } from '../tags/tags.module';

@Module({
  imports: [TagsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, CustomerLinkerService],
  exports: [TransactionsService, CustomerLinkerService],
})
export class TransactionsModule {}
