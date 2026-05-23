import { IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class SuggestCategoryDto {
  @IsUUID() transactionId!: string;
  @IsBoolean() @IsOptional() force?: boolean;
}

export class ApplyAcceptDto { @IsIn(['accept']) action!: 'accept'; }
export class ApplyEditDto {
  @IsIn(['edit']) action!: 'edit';
  @IsUUID() chosenCategoryId!: string;
  @IsUUID() @IsOptional() chosenVendorId?: string | null;
}
export class ApplyRejectDto { @IsIn(['reject']) action!: 'reject'; }

export class ApplyDto {
  @IsUUID() transactionId!: string;
  decision!: ApplyAcceptDto | ApplyEditDto | ApplyRejectDto;
}

export class BulkSuggestDto {
  @IsArray() @IsString({ each: true }) @IsOptional() accountIds?: string[];
  @IsDateString() @IsOptional() dateFrom?: string;
  @IsDateString() @IsOptional() dateTo?: string;
  @IsIn(['uncategorised', 'all']) @IsOptional() scope?: 'uncategorised' | 'all';
  @IsArray() @IsString({ each: true }) @IsOptional() transactionIds?: string[];
  @IsBoolean() @IsOptional() force?: boolean;
}
