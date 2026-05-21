import { Type } from 'class-transformer';
import { IsBoolean, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateAccountDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @MinLength(1) @MaxLength(120) bank!: string;
  @IsString() @IsOptional() @MaxLength(120) accountNumber?: string;
  @IsUUID() accountTypeId!: string;
  @Type(() => Number) @IsNumber() openingBalance!: number;
  @IsISO8601() openingDate!: string;
  @IsString() @IsOptional() @MaxLength(2000) notes?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateAccountDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(120) name?: string;
  @IsString() @IsOptional() @MinLength(1) @MaxLength(120) bank?: string;
  @IsString() @IsOptional() @MaxLength(120) accountNumber?: string;
  @IsUUID() @IsOptional() accountTypeId?: string;
  @Type(() => Number) @IsNumber() @IsOptional() openingBalance?: number;
  @IsISO8601() @IsOptional() openingDate?: string;
  @IsString() @IsOptional() @MaxLength(2000) notes?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
