import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const VALID_SORT_KEYS = ['date', 'amount', 'description'] as const;
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

  // Tag filtering — comma-separated list of tagIds. Matches transactions
  // tagged with ANY of the given tags (OR-of-tags).
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.length) return value.split(',');
    return [];
  })
  @IsArray()
  @IsUUID('all', { each: true })
  tagIds?: string[];

  @IsOptional() @IsIn(['true'])
  tagNone?: 'true';

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
  @IsString() @IsOptional() @MaxLength(2000) notes?: string;
}

export class BulkDeleteDto {
  @IsArray() @IsUUID('all', { each: true }) @IsOptional() ids?: string[];
}

export class CreateTransactionDto {
  @IsUUID() accountId!: string;
  @IsISO8601() date!: string;                        // YYYY-MM-DD
  @Type(() => Number) @IsNumber() amount!: number;   // signed: negative = withdrawal, positive = deposit
  @IsString() @MaxLength(500) description!: string;
  @IsUUID() @IsOptional() categoryId?: string;
  @IsArray() @IsUUID('all', { each: true }) @IsOptional() tagIds?: string[];
  @IsString() @IsOptional() @MaxLength(2000) notes?: string;
}

// Generic core-field update — date/amount/description/account/notes.
// Category updates still go through PATCH /:id/category (different audit
// semantics). Tag updates go through PATCH /:id/tags.
export class UpdateTransactionDto {
  @IsUUID() @IsOptional() accountId?: string;
  @IsISO8601() @IsOptional() date?: string;
  @Type(() => Number) @IsNumber() @IsOptional() amount?: number;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsString() @IsOptional() @MaxLength(2000) notes?: string;
}

// POST /transactions/link-customers — run the deterministic linker.
// Empty body = link every transaction whose linkedCustomerId is null.
export class LinkCustomersDto {
  @IsArray() @IsUUID('all', { each: true }) @IsOptional() transactionIds?: string[];
  @IsOptional() force?: boolean;
}
