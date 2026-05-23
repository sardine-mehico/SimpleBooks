import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const VALID_SORT_KEYS = ['date', 'amount', 'description', 'runningBalance'] as const;
export type TransactionSortKey = (typeof VALID_SORT_KEYS)[number];

const VALID_CATEGORY_KINDS = ['INCOME', 'EXPENSE', 'TRANSFER', 'OTHER'] as const;
export type CategoryKind = (typeof VALID_CATEGORY_KINDS)[number];

export class ListTransactionsDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.length) return value.split(',');
    return [];
  })
  @IsArray()
  @IsUUID('all', { each: true })
  accountIds?: string[];

  @IsOptional() @IsISO8601() dateFrom?: string;
  @IsOptional() @IsISO8601() dateTo?: string;

  @IsOptional() @IsString() @MaxLength(200)
  q?: string;

  // Category filtering — precedence when multiple params are sent:
  //   categoryId > categoryUncategorised > categoryKind
  @IsOptional() @IsUUID() categoryId?: string;

  @IsOptional() @IsIn(['true'])
  categoryUncategorised?: 'true';

  @IsOptional() @IsIn(VALID_CATEGORY_KINDS as unknown as string[])
  categoryKind?: CategoryKind;

  // Vendor filtering — precedence: vendorId > vendorNone
  @IsOptional() @IsUUID() vendorId?: string;

  @IsOptional() @IsIn(['true'])
  vendorNone?: 'true';

  @IsOptional() @IsIn(['true'])
  pendingAiReview?: 'true';

  @IsOptional() @IsIn(VALID_SORT_KEYS as unknown as string[])
  sortBy?: TransactionSortKey;

  @IsOptional() @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  pageSize?: number;
}

export class SplitItemDto {
  @IsUUID() categoryId!: string;
  @Type(() => Number) @IsNumber() amount!: number;
  @IsString() @IsOptional() @MaxLength(500) notes?: string;
}

export class SetSplitsDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SplitItemDto) splits!: SplitItemDto[];
}

export class SetCategoryDto {
  @IsUUID() @IsOptional() categoryId?: string;
  @IsUUID() @IsOptional() vendorId?: string;
  @IsString() @IsOptional() @MaxLength(2000) notes?: string;
}

export class BulkDeleteDto {
  @IsArray() @IsUUID('all', { each: true }) @IsOptional() ids?: string[];
}
