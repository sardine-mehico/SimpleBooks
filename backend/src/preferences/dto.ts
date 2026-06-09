import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpsertPreferencesDto {
  @IsString() @IsOptional() @MaxLength(64) timezone?: string;
  @Type(() => Number) @IsInt() @IsOptional() @Min(1) @Max(12) financialYearStart?: number;
  @Type(() => Number) @IsInt() @IsOptional() @Min(1) @Max(50) aiMiningThreshold?: number;
  @IsString() @IsOptional() @MaxLength(10_000) defaultInvoiceTerms?: string;
}

export class UpsertTermsDto {
  // Empty string is allowed — admin can clear the default by saving "".
  // `null` (omitting) is treated as "no change" by the controller.
  @IsString() @IsOptional() @MaxLength(10_000) defaultInvoiceTerms?: string;
}
