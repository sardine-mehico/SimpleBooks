import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaymentTerms } from '@prisma/client';

export class CreateCustomerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsEmail({}, { message: 'Primary billing email is required and must be a valid email' })
  billingEmail1!: string;

  @IsEmail()
  @IsOptional()
  billingEmail2?: string;

  @IsString()
  @MinLength(1, { message: 'Billing Company is required' })
  billingCompanyId!: string;

  @IsEnum(PaymentTerms, { message: 'Payment Due In is required' })
  paymentTerms!: PaymentTerms;

  @IsString()
  @MinLength(1, { message: 'Address is required' })
  address!: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateCustomerDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(200) name?: string;
  @IsEmail() @IsOptional() billingEmail1?: string;
  @IsEmail() @IsOptional() billingEmail2?: string;
  @IsString() @IsOptional() billingCompanyId?: string;
  @IsEnum(PaymentTerms) @IsOptional() paymentTerms?: PaymentTerms;
  @IsString() @IsOptional() address?: string;
  @IsString() @IsOptional() @MaxLength(2000) notes?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
