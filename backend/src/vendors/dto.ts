import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';

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

export class ExtractCandidatesDto {
  @IsIn(['all-transactions', 'csv']) source!: 'all-transactions' | 'csv';
  @IsString() @IsOptional() csvBase64?: string;
  @IsISO8601() @IsOptional() dateFrom?: string;
  @IsISO8601() @IsOptional() dateTo?: string;
  @IsArray() @IsOptional() @IsUUID('all', { each: true }) accountIds?: string[];
}

export class ExtractCandidateInputDto {
  @IsString() name!: string;
  @IsEnum(VendorKindDto) kind!: VendorKindDto;
  @IsArray() @IsString({ each: true }) aliases!: string[];
}

export class CommitExtractedDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ExtractCandidateInputDto) candidates!: ExtractCandidateInputDto[];
}
