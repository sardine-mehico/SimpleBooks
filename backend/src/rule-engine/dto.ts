import { IsArray, IsBoolean, IsIn, IsISO8601, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RecategoriseDto {
  @IsIn(['uncategorised', 'all']) scope!: 'uncategorised' | 'all';
  @IsArray() @IsOptional() @IsUUID('all', { each: true }) accountIds?: string[];
  @IsISO8601() @IsOptional() dateFrom?: string;
  @IsISO8601() @IsOptional() dateTo?: string;
  @IsBoolean() @IsOptional() preserveSplits?: boolean;
}

class TestCsvRowDto {
  @IsString() date!: string;
  @IsString() amount!: string;
  @IsString() description!: string;
}

export class TestRulesDto {
  @IsIn(['existing', 'csv']) source!: 'existing' | 'csv';
  @IsArray() @IsOptional() @ValidateNested({ each: true }) @Type(() => TestCsvRowDto) csvRows?: TestCsvRowDto[];
  @IsArray() @IsOptional() @IsUUID('all', { each: true }) accountIds?: string[];
  @IsISO8601() @IsOptional() dateFrom?: string;
  @IsISO8601() @IsOptional() dateTo?: string;
  @IsArray() @IsOptional() @IsUUID('all', { each: true }) ruleIds?: string[];
}
