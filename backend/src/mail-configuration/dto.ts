import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { EmailEncryption } from '@prisma/client';

export class UpsertMailConfigurationDto {
  @IsString() @IsOptional() @MaxLength(255) smtpServer?: string;
  @Type(() => Number) @IsInt() @IsOptional() @Min(1) @Max(65535) port?: number;
  @IsEnum(EmailEncryption) @IsOptional() encryption?: EmailEncryption;
  @IsString() @IsOptional() @MaxLength(255) user?: string;
  @IsString() @IsOptional() @MaxLength(255) password?: string;
}
