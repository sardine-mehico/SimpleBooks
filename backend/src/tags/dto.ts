import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class CreateTagDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsArray() @IsOptional() @ArrayMaxSize(50) @Type(() => String) aliases?: string[];
  @IsString() @IsOptional() @MaxLength(32) color?: string;
  @IsString() @IsOptional() @MaxLength(500) notes?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @ValidateIf((o) => o.customerId !== null) @IsUUID() @IsOptional() customerId?: string | null;
}

export class UpdateTagDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(80) name?: string;
  @IsArray() @IsOptional() @ArrayMaxSize(50) @Type(() => String) aliases?: string[];
  @IsString() @IsOptional() @MaxLength(32) color?: string;
  @IsString() @IsOptional() @MaxLength(500) notes?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @ValidateIf((o) => o.customerId !== null) @IsUUID() @IsOptional() customerId?: string | null;
}

export class ApplyTagsToTransactionDto {
  @IsArray() @Type(() => String) tagIds!: string[];
}
