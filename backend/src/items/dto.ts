import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength, MaxLength } from 'class-validator';

export class CreateItemDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @Type(() => Number) @IsNumber() @Min(0) unitPrice!: number;
  @IsString() @IsOptional() description?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateItemDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(200) name?: string;
  @Type(() => Number) @IsNumber() @IsOptional() @Min(0) unitPrice?: number;
  @IsString() @IsOptional() description?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
