import { IsDateString, IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class StatementQueryDto {
  @IsUUID() customerId!: string;
  @IsUUID() billingCompanyId!: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class SendStatementDto {
  @IsUUID() customerId!: string;
  @IsUUID() billingCompanyId!: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;

  // The Send dialog's editable fields. All required at send time.
  @IsEmail() fromEmail!: string;
  @IsEmail() toEmail!: string;
  @IsOptional() @IsString() ccEmail?: string;
  @IsOptional() @IsString() bccEmail?: string;
  @IsString() @MinLength(1) @MaxLength(255) subject!: string;
  @IsString() html!: string;
}
