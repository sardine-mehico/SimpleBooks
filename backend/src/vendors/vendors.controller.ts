import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { VendorExtractorService } from './vendor-extractor.service';
import { CommitExtractedDto, CreateVendorDto, ExtractCandidatesDto, UpdateVendorDto } from './dto';

@Controller('vendors')
export class VendorsController {
  constructor(private service: VendorsService, private extractor: VendorExtractorService) {}

  @Get() list(@Query('includeInactive') includeInactive?: string) {
    return this.service.list(includeInactive === 'true');
  }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateVendorDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateVendorDto) { return this.service.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }

  @Post('extract')
  @HttpCode(200)
  extract(@Body() dto: ExtractCandidatesDto) { return this.extractor.extract(dto); }

  @Post('extract/commit')
  @HttpCode(200)
  commitExtracted(@Body() dto: CommitExtractedDto) { return this.extractor.commit(dto.candidates); }
}
