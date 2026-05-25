import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateAiProviderDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @MinLength(1) @MaxLength(120) model!: string;
  @IsString() @MinLength(1) @MaxLength(500) apiBaseUrl!: string;
  @IsString() @MaxLength(2000) apiKey!: string;
  @IsBoolean() @IsOptional() isPrimary?: boolean;
  @IsInt() @Min(1) @Max(10000) @IsOptional() requestsPerMinute?: number;
}

export class UpdateAiProviderDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(120) name?: string;
  @IsString() @IsOptional() @MinLength(1) @MaxLength(120) model?: string;
  @IsString() @IsOptional() @MinLength(1) @MaxLength(500) apiBaseUrl?: string;
  @IsString() @IsOptional() @MaxLength(2000) apiKey?: string;
  @IsInt() @IsOptional() @Min(1) @Max(10000) requestsPerMinute?: number;
  @IsBoolean() @IsOptional() isEnabled?: boolean;
}

export class MoveAiProviderDto {
  @IsIn(['up', 'down']) direction!: 'up' | 'down';
}
