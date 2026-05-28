// backend/src/reports/dto.ts
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ReportQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsString() accountIds?: string;  // comma-separated UUIDs; absent = all accounts
  @IsOptional() @IsString() tagIds?: string;      // comma-separated UUIDs; absent = no tag filter (all transactions)
}

export class TagsReportQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsString() kind!: 'EXPENSE' | 'INCOME';
  @IsOptional() @IsString() accountIds?: string;
}
