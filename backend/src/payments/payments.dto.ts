// backend/src/payments/payments.dto.ts
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumberString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class AllocationLineDto {
  @IsUUID() invoiceId!: string;
  // Decimal-as-string per existing convention (Prisma Decimal columns serialise to string).
  @IsNumberString() amount!: string;
}

export class ApplyPaymentDto {
  @IsUUID() transactionId!: string;

  // ValidationPipe runs with whitelist: true — every nested array element needs
  // class-validator decorators or the contents are silently stripped. The
  // @ValidateNested + @Type combo handles the array; each AllocationLineDto
  // field is decorated above.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AllocationLineDto)
  allocations!: AllocationLineDto[];
}

export class QueueQueryDto {
  @IsBoolean() @IsOptional() showAll?: boolean;
}
