// backend/src/reports/dto.ts
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ReportQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsString() accountIds?: string;  // comma-separated UUIDs; absent = all accounts
}
