import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength, MaxLength } from 'class-validator';
import { toNumberOrUndefined } from '../common/validators';

export class CreateItemDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @Transform(toNumberOrUndefined) @IsNumber() @Min(0) unitPrice!: number;
  @IsString() @IsOptional() description?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateItemDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(200) name?: string;
  @Transform(toNumberOrUndefined) @IsNumber() @IsOptional() @Min(0) unitPrice?: number;
  @IsString() @IsOptional() description?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
