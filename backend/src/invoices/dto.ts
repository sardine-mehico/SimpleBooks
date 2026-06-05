import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { InvoiceStatus } from '@prisma/client';
import { toNumberOrUndefined } from '../common/validators';

export class LineItemDto {
  @IsString() @IsOptional() id?: string;
  @IsString() @IsOptional() itemId?: string;
  @IsString() @MinLength(1) description!: string;
  @Transform(toNumberOrUndefined) @IsNumber() @Min(0) quantity!: number;
  @Transform(toNumberOrUndefined) @IsNumber() @Min(0) unitPrice!: number;
  @IsString() @IsOptional() taxTypeId?: string;
  @IsString() @IsOptional() taxName?: string;
  @Transform(toNumberOrUndefined) @IsNumber() @IsOptional() @Min(0) taxRate?: number;
}

export class CreateInvoiceDto {
  @IsISO8601() @IsOptional() invoiceDate?: string;
  @IsISO8601() @IsOptional() dueDate?: string;
  @IsString() @IsOptional() customerId?: string;
  @IsString() @IsOptional() billingCompanyId?: string;
  @IsEnum(InvoiceStatus) @IsOptional() status?: InvoiceStatus;
  @IsString() @IsOptional() poNumber?: string;
  @IsString() @IsOptional() paymentDetails?: string;
  @IsString() @IsOptional() internalNotes?: string;
  @IsString() @IsOptional() terms?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems!: LineItemDto[];
}

export class UpdateInvoiceDto {
  @IsISO8601() @IsOptional() invoiceDate?: string;
  @IsISO8601() @IsOptional() dueDate?: string;
  @IsString() @IsOptional() customerId?: string;
  @IsString() @IsOptional() billingCompanyId?: string;
  @IsEnum(InvoiceStatus) @IsOptional() status?: InvoiceStatus;
  @IsString() @IsOptional() poNumber?: string;
  @IsString() @IsOptional() paymentDetails?: string;
  @IsString() @IsOptional() internalNotes?: string;
  @IsString() @IsOptional() terms?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  @IsOptional()
  lineItems?: LineItemDto[];
}

// Operator-supplied reason captured by the confirmation modals on Void /
// Delete. Required at the API level (`@IsNotEmpty`) — the UI insists the
// operator type something before the destructive action goes through.
export class VoidInvoiceDto {
  @IsString() @IsNotEmpty() reason!: string;
}

export class DeleteInvoiceDto {
  @IsString() @IsNotEmpty() reason!: string;
}

export class BulkIdsDto {
  @IsArray()
  @IsUUID('all', { each: true })
  @IsString({ each: true })
  ids!: string[];
}

// Payload for `POST /invoices/:id/send`. Every field is optional — when the
// dialog isn't customising a value, the backend falls back to the assigned
// EmailTemplate (tokens substituted) and the billing company's routing.
// The dialog only lets the user edit From / To / CC / BCC / Subject /
// attachPdf; `html` rides through so the body shown at preview time is
// exactly what gets sent (token substitution is already applied).
// `attachPdf` is the "Attach PDF invoice" checkbox: when true the rendered
// PDF rides along as an attachment alongside the public link.
export class SendInvoiceDto {
  @IsString() @IsOptional() from?: string;
  @IsString() @IsOptional() to?: string;
  @IsString() @IsOptional() cc?: string;
  @IsString() @IsOptional() bcc?: string;
  @IsString() @IsOptional() subject?: string;
  @IsString() @IsOptional() html?: string;
  @IsBoolean() @IsOptional() attachPdf?: boolean;
}
