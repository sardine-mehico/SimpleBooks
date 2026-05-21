import { Module } from '@nestjs/common';
import { TaxTypesController } from './tax-types.controller';
import { TaxTypesService } from './tax-types.service';

@Module({
  controllers: [TaxTypesController],
  providers: [TaxTypesService],
  exports: [TaxTypesService],
})
export class TaxTypesModule {}
