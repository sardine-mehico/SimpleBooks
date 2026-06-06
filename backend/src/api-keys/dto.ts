import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @IsUUID() userId!: string;
  @IsString() @MinLength(2) @MaxLength(120) label!: string;
  // ISO date string; if absent, the key never expires.
  @IsOptional() @IsISO8601() expiresAt?: string;
}
