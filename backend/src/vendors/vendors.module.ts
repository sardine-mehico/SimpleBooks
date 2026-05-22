import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { VendorExtractorService } from './vendor-extractor.service';

@Module({
  controllers: [VendorsController],
  providers: [VendorsService, VendorExtractorService],
  exports: [VendorsService, VendorExtractorService],
})
export class VendorsModule {}
