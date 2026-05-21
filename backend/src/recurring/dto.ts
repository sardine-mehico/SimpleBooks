import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { SendingOption } from '@prisma/client';

export class RecurringLineItemDto {
  @IsString() @IsOptional() id?: string;
  @IsString() @IsOptional() itemId?: string;
  @IsString() description!: string;
  @Type(() => Number) @IsNumber() @Min(0) unitPrice!: number;
  @IsString() @IsOptional() taxTypeId?: string;
  @IsString() @IsOptional() taxName?: string;
  @Type(() => Number) @IsNumber() @IsOptional() @Min(0) taxRate?: number;
}

export class CreateRecurringRuleDto {
  // Schedule Name is derived server-side from customer + schedule, so we
  // intentionally do not accept it from the client.
  @IsISO8601() startDate!: string;
  @IsString() recurringScheduleId!: string;
  @IsEnum(SendingOption) @IsOptional() sendingOption?: SendingOption;
  @IsBoolean() @IsOptional() active?: boolean;
  @IsString() customerId!: string;
  @IsString() @IsOptional() poNumber?: string;
  @IsString() @IsOptional() paymentDetails?: string;
  @IsString() @IsOptional() internalNotes?: string;
  @IsString() @IsOptional() terms?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RecurringLineItemDto)
  lineItems!: RecurringLineItemDto[];
}

export class UpdateRecurringRuleDto {
  @IsISO8601() @IsOptional() startDate?: string;
  @IsString() @IsOptional() recurringScheduleId?: string;
  @IsEnum(SendingOption) @IsOptional() sendingOption?: SendingOption;
  @IsBoolean() @IsOptional() active?: boolean;
  @IsString() @IsOptional() customerId?: string;
  @IsString() @IsOptional() poNumber?: string;
  @IsString() @IsOptional() paymentDetails?: string;
  @IsString() @IsOptional() internalNotes?: string;
  @IsString() @IsOptional() terms?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecurringLineItemDto)
  @IsOptional()
  lineItems?: RecurringLineItemDto[];
}
