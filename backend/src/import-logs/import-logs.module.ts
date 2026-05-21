import { Module } from '@nestjs/common';
import { ImportLogsController } from './import-logs.controller';
import { ImportLogsService } from './import-logs.service';

@Module({
  controllers: [ImportLogsController],
  providers: [ImportLogsService],
  exports: [ImportLogsService],
})
export class ImportLogsModule {}
