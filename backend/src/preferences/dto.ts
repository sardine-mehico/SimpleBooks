import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpsertPreferencesDto {
  @IsString() @IsOptional() @MaxLength(64) timezone?: string;
  @Type(() => Number) @IsInt() @IsOptional() @Min(1) @Max(12) financialYearStart?: number;
}
