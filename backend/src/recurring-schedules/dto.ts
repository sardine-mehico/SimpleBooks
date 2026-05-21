import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { RecurringIntervalUnit } from '@prisma/client';

export class CreateRecurringScheduleDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsEnum(RecurringIntervalUnit) intervalUnit!: RecurringIntervalUnit;
  @Type(() => Number) @IsInt() @Min(1) intervalCount!: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateRecurringScheduleDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(80) name?: string;
  @IsEnum(RecurringIntervalUnit) @IsOptional() intervalUnit?: RecurringIntervalUnit;
  @Type(() => Number) @IsInt() @IsOptional() @Min(1) intervalCount?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
