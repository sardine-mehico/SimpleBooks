import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export enum CategoryKindDto {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
  TRANSFER = 'TRANSFER',
  OTHER = 'OTHER',
}

export class CreateCategoryDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsEnum(CategoryKindDto) kind!: CategoryKindDto;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() sortOrder?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateCategoryDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(120) name?: string;
  @IsEnum(CategoryKindDto) @IsOptional() kind?: CategoryKindDto;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() sortOrder?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
