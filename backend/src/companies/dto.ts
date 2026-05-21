import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EmailEncryption, SendVia } from '@prisma/client';

export class CreateCompanyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString() @MinLength(1) @MaxLength(60) abn!: string;
  @IsString() @MinLength(1) address!: string;
  @IsString() @MinLength(1) paymentDetails!: string;
  @IsEmail({}, { message: 'Accounts Email is required and must be a valid email' }) accountsEmail!: string;

  @IsEmail({}, { message: 'Invoice Backup Email (BCC) is required and must be a valid email' })
  invoiceBcc!: string;

  @IsString() @IsOptional() @MaxLength(2000) notes?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;

  @IsEnum(SendVia) @IsOptional() sendVia?: SendVia;
  @IsString() @IsOptional() customSmtpServer?: string;
  @IsInt() @IsOptional() @Min(1) @Max(65535) customSmtpPort?: number;
  @IsEnum(EmailEncryption) @IsOptional() customSmtpEncryption?: EmailEncryption;
  @IsString() @IsOptional() customSmtpUser?: string;
  @IsString() @IsOptional() customSmtpPassword?: string;
}

export class UpdateCompanyDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(200) name?: string;
  @IsString() @IsOptional() @MaxLength(60) abn?: string;
  @IsString() @IsOptional() address?: string;
  @IsString() @IsOptional() paymentDetails?: string;
  @IsEmail() @IsOptional() accountsEmail?: string;
  @IsEmail({}, { message: 'Invoice Backup Email (BCC) must be a valid email' }) @IsOptional() invoiceBcc?: string;
  @IsString() @IsOptional() @MaxLength(2000) notes?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;

  @IsEnum(SendVia) @IsOptional() sendVia?: SendVia;
  @IsString() @IsOptional() customSmtpServer?: string;
  @IsInt() @IsOptional() @Min(1) @Max(65535) customSmtpPort?: number;
  @IsEnum(EmailEncryption) @IsOptional() customSmtpEncryption?: EmailEncryption;
  @IsString() @IsOptional() customSmtpUser?: string;
  @IsString() @IsOptional() customSmtpPassword?: string;
}
