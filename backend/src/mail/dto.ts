import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { EmailEncryption } from '@prisma/client';

// Test-email payload: the SMTP config under test plus a recipient. The config
// is sent from the client so we can validate not-yet-saved values from the
// edit form (the user clicks "Send Test Email" before clicking Save).
export class TestEmailDto {
  @IsEmail() to!: string;

  @IsString() smtpServer!: string;
  @IsInt() @Min(1) @Max(65535) port!: number;
  @IsEnum(EmailEncryption) encryption!: EmailEncryption;
  @IsString() @IsOptional() user?: string;
  @IsString() @IsOptional() password?: string;
}
