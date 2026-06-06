import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { TransactionImportsService } from './transaction-imports.service';
import { CommitImportDto } from './dto';
import { ColumnMapping } from './types';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('transaction-imports')
@Controller('transaction-imports')
export class TransactionImportsController {
  constructor(private service: TransactionImportsService) {}

  @Post('sniff')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @HttpCode(200)
  async sniff(
    @UploadedFile() file: MulterFile,
    @Body('accountId') accountId: string,
  ) {
    if (!file) throw new BadRequestException('file is required');
    if (!accountId) throw new BadRequestException('accountId is required');
    return this.service.sniff(file.buffer, accountId, file.originalname);
  }

  @Post('commit')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @HttpCode(200)
  async commit(
    @UploadedFile() file: MulterFile,
    @Body() body: CommitImportDto,
  ) {
    if (!file) throw new BadRequestException('file is required');
    let mapping: ColumnMapping;
    try {
      mapping = JSON.parse(body.mapping);
    } catch {
      throw new BadRequestException('mapping must be a JSON-stringified ColumnMapping');
    }
    return this.service.commit(
      file.buffer,
      body.accountId,
      body.fileSha256,
      mapping,
      body.filename ?? file.originalname,
      body.applyRules === true,
    );
  }
}
