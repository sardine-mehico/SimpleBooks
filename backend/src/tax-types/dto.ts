import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTaxTypeDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @Type(() => Number) @IsNumber() @Min(0) @Max(100) rate!: number;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateTaxTypeDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(100) name?: string;
  @Type(() => Number) @IsNumber() @IsOptional() @Min(0) @Max(100) rate?: number;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
