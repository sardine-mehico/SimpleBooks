import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export enum VendorKindDto {
  MERCHANT = 'MERCHANT',
  PERSON = 'PERSON',
  CUSTOMER = 'CUSTOMER',
  BANK = 'BANK',
  OTHER = 'OTHER',
}

export class CreateVendorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEnum(VendorKindDto)
  kind!: VendorKindDto;

  @IsArray()
  @IsString({ each: true })
  aliases!: string[];

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateVendorDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsEnum(VendorKindDto)
  @IsOptional()
  kind?: VendorKindDto;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  aliases?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
