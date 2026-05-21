# Banking Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase A of the Banking module — accounts CRUD, transactions table with server-side filter/sort/pagination, two-format CSV import with duplicate detection, and persisted import-report logs under Settings.

**Architecture:** Four new NestJS backend modules (`accounts`, `transactions`, `transaction-imports`, `import-logs`), Prisma schema additions only (additive, safe for `db push`), pure-function CSV parser + sniffer, synchronous import endpoint with `multipart/form-data`. Frontend follows existing per-module pattern: server-component page + client list/form component, `EditPageChrome` for edit pages, but the transactions table is the project's first server-side-paginated list (new `TransactionsTable` component sibling to `FilteredList`).

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL, Next.js 15 (App Router, React 19), Tailwind, papaparse (new), Node `crypto` builtin. No new frontend dependencies.

**Source of truth:** [docs/superpowers/specs/2026-05-21-banking-phase-a-design.md](../specs/2026-05-21-banking-phase-a-design.md). When in doubt, re-read the spec.

**Verification approach:** This repo has no test suite, no linter, no host-side build. Pure functions (CSV parser, sniffer, hash) get small `*.test.ts` files using `node:assert` runnable via `docker compose exec backend npx ts-node <path>` — no Jest infra added. Everything else is verified by `docker logs` (backend boot clean), `curl` against the running stack, and browser checks at `localhost:3000`.

**Commits:** This repo is not currently a git repository. Task 0 runs `git init` so the per-task commit safety net works. Conventional Commits style: `feat: …`, `chore: …`, `docs: …`.

---

## Task 0: Initialise git repository

**Files:**
- Modify: none (uses existing `.gitignore`)

- [ ] **Step 1: Initialise the repo and stage the current tree**

```bash
cd /home/reallybasic/Projects/Accounting
git init
git add -A
```

- [ ] **Step 2: Inspect what's staged — confirm `.env` and `node_modules/` are excluded**

```bash
git status
git diff --cached --stat | tail -5
```

Expected: `.env` not in the index (`.gitignore` covers it). `node_modules/`, `frontend/.next/`, `backend/dist/` likewise excluded.

- [ ] **Step 3: Create the baseline commit**

```bash
git commit -m "chore: initial baseline before Banking Phase A"
```

Expected: a single commit, current working tree clean.

---

## Task 1: Prisma schema — 4 new models

**Files:**
- Modify: `backend/prisma/schema.prisma` (append at end)
- Modify: `backend/prisma/seed.ts` (append AccountType + sample Account seed)

- [ ] **Step 1: Append the schema additions**

Add at the end of `backend/prisma/schema.prisma`:

```prisma
// ── Banking ─────────────────────────────────────────────────────────────────

// Lookup of account types. Seeded with the six common AU personal types; the
// user can add/rename/deactivate from /settings/account-types. FK Restrict on
// Account.accountTypeId means a type can't be deleted while in use (mirrors
// BillingCompany → InvoiceTemplate).
model AccountType {
  id        String   @id @default(uuid())
  name      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  accounts Account[]
}

// A bank account the user tracks. `openingBalance` + `openingDate` anchor the
// running-balance computation; current balance = openingBalance + SUM(amount)
// across all transactions. Soft-delete only (isActive).
model Account {
  id             String      @id @default(uuid())
  name           String
  bank           String
  accountNumber  String?
  accountTypeId  String
  accountType    AccountType @relation(fields: [accountTypeId], references: [id], onDelete: Restrict)
  openingBalance Decimal     @db.Decimal(14, 2) @default(0)
  openingDate    DateTime    @db.Date
  notes          String?
  isActive       Boolean     @default(true)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  transactions Transaction[]
  imports      TransactionImport[]
}

// A single bank-statement line. `amount` is SIGNED (negative=debit,
// positive=credit). `runningBalance` is the bank-supplied figure for the
// row when the CSV exposes it; nullable so manual entries and bank formats
// without a balance column still fit. `importHash` is the dedupe key —
// sha256 of date|amount.toFixed(2)|normaliseDesc(description)|runningBalance,
// uniqued per account.
//
// `categoryId`, `vendorCustomerId`, `notes` are Phase-B forward-compat and
// neither read nor written by Phase A code.
model Transaction {
  id             String   @id @default(uuid())
  accountId      String
  account        Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)

  date           DateTime @db.Date
  amount         Decimal  @db.Decimal(14, 2)
  description    String
  runningBalance Decimal? @db.Decimal(14, 2)

  categoryId       String?
  vendorCustomerId String?
  notes            String?

  importHash String
  importId   String?
  import     TransactionImport? @relation(fields: [importId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([accountId, importHash])
  @@index([accountId, date])
  @@index([date])
}

// One row per CSV import attempt — always created, even on zero-import or
// all-failed outcomes, so the audit trail is complete. `reportJson` holds
// the full ImportReport shape consumed by <ImportReportPopup>.
model TransactionImport {
  id         String   @id @default(uuid())
  accountId  String
  account    Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)

  filename   String
  fileSize   Int
  fileSha256 String
  importedAt DateTime @default(now())

  mappingJson    Json
  rowsTotal      Int
  rowsImported   Int
  rowsSkippedDup Int
  rowsFailed     Int
  reportJson     Json

  transactions Transaction[]
}
```

- [ ] **Step 2: Append seed entries**

In `backend/prisma/seed.ts`, add **inside the existing seed function** (the one that runs only when User table is empty — find the existing block and append after the existing entity seeds, before the final `await prisma.$disconnect()`):

```ts
  // ── AccountType lookup (Banking Phase A) ─────────────────────────────────
  const accountTypes = [
    'Everyday',
    'Savings',
    'Credit Card',
    'Loan',
    'Cash',
    'Offset',
  ];
  for (const name of accountTypes) {
    await prisma.accountType.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // Two sample accounts so empty-state isn't the first impression.
  const everyday = await prisma.accountType.findUniqueOrThrow({ where: { name: 'Everyday' } });
  const savings = await prisma.accountType.findUniqueOrThrow({ where: { name: 'Savings' } });
  const today = new Date();
  await prisma.account.create({
    data: {
      name: 'CBA Smart Access',
      bank: 'Commonwealth Bank',
      accountTypeId: everyday.id,
      openingBalance: 0,
      openingDate: today,
    },
  });
  await prisma.account.create({
    data: {
      name: 'CBA Goal Saver',
      bank: 'Commonwealth Bank',
      accountTypeId: savings.id,
      openingBalance: 0,
      openingDate: today,
    },
  });
```

- [ ] **Step 3: Reset the DB and push schema**

```bash
docker compose down -v
docker compose up -d
sleep 8
docker logs simplebooks-backend-1 --tail 80
```

Expected: backend boot logs show `prisma db push` completing without errors, followed by the seed running (look for `Nest application successfully started`).

- [ ] **Step 4: Verify schema landed via psql**

```bash
docker compose exec postgres psql -U accounting -d accounting -c "\dt" \
  | grep -E "AccountType|Account|Transaction|TransactionImport"
```

Expected: four rows listing the four new tables.

```bash
docker compose exec postgres psql -U accounting -d accounting -c \
  "SELECT name FROM \"AccountType\" ORDER BY name"
```

Expected: 6 rows (Cash, Credit Card, Everyday, Loan, Offset, Savings).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/seed.ts
git commit -m "feat(banking): add AccountType, Account, Transaction, TransactionImport schema + seed"
```

---

## Task 2: Backend — AccountTypes module (CRUD for the lookup)

**Files:**
- Create: `backend/src/account-types/account-types.module.ts`
- Create: `backend/src/account-types/account-types.controller.ts`
- Create: `backend/src/account-types/account-types.service.ts`
- Create: `backend/src/account-types/dto.ts`
- Modify: `backend/src/app.module.ts` (register)

- [ ] **Step 1: Create the DTO**

`backend/src/account-types/dto.ts`:

```ts
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAccountTypeDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateAccountTypeDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(60) name?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
```

- [ ] **Step 2: Create the service**

`backend/src/account-types/account-types.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountTypeDto, UpdateAccountTypeDto } from './dto';

@Injectable()
export class AccountTypesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.accountType.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async get(id: string) {
    const row = await this.prisma.accountType.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  create(data: CreateAccountTypeDto) {
    return this.prisma.accountType.create({
      data: { ...data, isActive: data.isActive ?? true },
    });
  }

  async update(id: string, data: UpdateAccountTypeDto) {
    await this.get(id);
    return this.prisma.accountType.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.get(id);
    const inUse = await this.prisma.account.count({ where: { accountTypeId: id } });
    if (inUse > 0) {
      throw new ConflictException(
        `Cannot delete: ${inUse} account${inUse === 1 ? '' : 's'} reference this type. Reassign them first.`,
      );
    }
    await this.prisma.accountType.delete({ where: { id } });
    return { ok: true };
  }
}
```

- [ ] **Step 3: Create the controller**

`backend/src/account-types/account-types.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AccountTypesService } from './account-types.service';
import { CreateAccountTypeDto, UpdateAccountTypeDto } from './dto';

@Controller('account-types')
export class AccountTypesController {
  constructor(private service: AccountTypesService) {}

  @Get() list() { return this.service.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateAccountTypeDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateAccountTypeDto) { return this.service.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}
```

- [ ] **Step 4: Create the module**

`backend/src/account-types/account-types.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AccountTypesController } from './account-types.controller';
import { AccountTypesService } from './account-types.service';

@Module({
  controllers: [AccountTypesController],
  providers: [AccountTypesService],
  exports: [AccountTypesService],
})
export class AccountTypesModule {}
```

- [ ] **Step 5: Register in `app.module.ts`**

In `backend/src/app.module.ts`, add the import and include it in `imports`:

```ts
import { AccountTypesModule } from './account-types/account-types.module';
```

Add `AccountTypesModule` to the `imports` array (alphabetical-ish, alongside `TaxTypesModule`).

- [ ] **Step 6: Restart backend and verify endpoint**

```bash
docker compose restart backend
sleep 5
curl -s http://localhost:4000/account-types | python3 -m json.tool | head -30
```

Expected: array of 6 rows with `Cash`, `Credit Card`, `Everyday`, `Loan`, `Offset`, `Savings`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/account-types backend/src/app.module.ts
git commit -m "feat(banking): account-types CRUD endpoints"
```

---

## Task 3: Backend — Accounts module (CRUD with computed balance)

**Files:**
- Create: `backend/src/accounts/accounts.module.ts`
- Create: `backend/src/accounts/accounts.controller.ts`
- Create: `backend/src/accounts/accounts.service.ts`
- Create: `backend/src/accounts/dto.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create the DTO**

`backend/src/accounts/dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsBoolean, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateAccountDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @MinLength(1) @MaxLength(120) bank!: string;
  @IsString() @IsOptional() @MaxLength(120) accountNumber?: string;
  @IsUUID() accountTypeId!: string;
  @Type(() => Number) @IsNumber() openingBalance!: number;
  @IsISO8601() openingDate!: string;
  @IsString() @IsOptional() @MaxLength(2000) notes?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateAccountDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(120) name?: string;
  @IsString() @IsOptional() @MinLength(1) @MaxLength(120) bank?: string;
  @IsString() @IsOptional() @MaxLength(120) accountNumber?: string;
  @IsUUID() @IsOptional() accountTypeId?: string;
  @Type(() => Number) @IsNumber() @IsOptional() openingBalance?: number;
  @IsISO8601() @IsOptional() openingDate?: string;
  @IsString() @IsOptional() @MaxLength(2000) notes?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
```

- [ ] **Step 2: Create the service**

`backend/src/accounts/accounts.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './dto';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async list(includeInactive = false) {
    const rows = await this.prisma.account.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        accountType: true,
        _count: { select: { transactions: true } },
      },
    });
    // Compute currentBalance for each account in one extra aggregate query.
    const sums = await this.prisma.transaction.groupBy({
      by: ['accountId'],
      _sum: { amount: true },
      where: { accountId: { in: rows.map((r) => r.id) } },
    });
    const sumByAccount = new Map(sums.map((s) => [s.accountId, s._sum.amount ?? new Prisma.Decimal(0)]));
    return rows.map((r) => ({
      ...r,
      currentBalance: new Prisma.Decimal(r.openingBalance).plus(sumByAccount.get(r.id) ?? 0).toString(),
    }));
  }

  async get(id: string) {
    const row = await this.prisma.account.findUnique({
      where: { id },
      include: {
        accountType: true,
        _count: { select: { transactions: true, imports: true } },
      },
    });
    if (!row) throw new NotFoundException();
    const sum = await this.prisma.transaction.aggregate({
      where: { accountId: id },
      _sum: { amount: true },
    });
    const latestImport = await this.prisma.transactionImport.findFirst({
      where: { accountId: id },
      orderBy: { importedAt: 'desc' },
      select: { id: true, importedAt: true, rowsImported: true },
    });
    return {
      ...row,
      currentBalance: new Prisma.Decimal(row.openingBalance)
        .plus(sum._sum.amount ?? 0)
        .toString(),
      latestImport,
    };
  }

  create(data: CreateAccountDto) {
    return this.prisma.account.create({
      data: {
        name: data.name,
        bank: data.bank,
        accountNumber: data.accountNumber,
        accountTypeId: data.accountTypeId,
        openingBalance: data.openingBalance,
        openingDate: new Date(data.openingDate),
        notes: data.notes,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(id: string, data: UpdateAccountDto) {
    await this.get(id);
    return this.prisma.account.update({
      where: { id },
      data: {
        name: data.name,
        bank: data.bank,
        accountNumber: data.accountNumber,
        accountTypeId: data.accountTypeId,
        openingBalance: data.openingBalance,
        openingDate: data.openingDate ? new Date(data.openingDate) : undefined,
        notes: data.notes,
        isActive: data.isActive,
      },
    });
  }

  async archive(id: string) {
    await this.get(id);
    return this.prisma.account.update({ where: { id }, data: { isActive: false } });
  }

  async restore(id: string) {
    await this.get(id);
    return this.prisma.account.update({ where: { id }, data: { isActive: true } });
  }
}
```

- [ ] **Step 3: Create the controller**

`backend/src/accounts/accounts.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './dto';

@Controller('accounts')
export class AccountsController {
  constructor(private service: AccountsService) {}

  @Get() list(@Query('includeInactive') includeInactive?: string) {
    return this.service.list(includeInactive === 'true');
  }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateAccountDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateAccountDto) { return this.service.update(id, dto); }
  @Patch(':id/archive') archive(@Param('id') id: string) { return this.service.archive(id); }
  @Patch(':id/restore') restore(@Param('id') id: string) { return this.service.restore(id); }
}
```

- [ ] **Step 4: Create the module**

`backend/src/accounts/accounts.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
```

- [ ] **Step 5: Register in `app.module.ts`** — add the import and entry.

- [ ] **Step 6: Restart and verify**

```bash
docker compose restart backend
sleep 5
curl -s http://localhost:4000/accounts | python3 -m json.tool
```

Expected: two seeded accounts, each with `currentBalance: "0"` and `accountType.name` populated.

```bash
ACCT=$(curl -s http://localhost:4000/accounts | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
curl -s http://localhost:4000/accounts/$ACCT | python3 -m json.tool | head -20
```

Expected: detail with `currentBalance`, `latestImport: null`, `_count` shape.

- [ ] **Step 7: Commit**

```bash
git add backend/src/accounts backend/src/app.module.ts
git commit -m "feat(banking): accounts CRUD with computed currentBalance"
```

---

## Task 4: Backend — Transactions module (server-side paginated list)

**Files:**
- Create: `backend/src/transactions/transactions.module.ts`
- Create: `backend/src/transactions/transactions.controller.ts`
- Create: `backend/src/transactions/transactions.service.ts`
- Create: `backend/src/transactions/dto.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create the DTO**

`backend/src/transactions/dto.ts`:

```ts
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

const VALID_SORT_KEYS = ['date', 'amount', 'description', 'runningBalance'] as const;
export type TransactionSortKey = (typeof VALID_SORT_KEYS)[number];

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

  @IsOptional() @IsIn(VALID_SORT_KEYS as unknown as string[])
  sortBy?: TransactionSortKey;

  @IsOptional() @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  pageSize?: number;
}
```

- [ ] **Step 2: Create the service**

`backend/src/transactions/transactions.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListTransactionsDto } from './dto';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async list(q: ListTransactionsDto) {
    const where: Prisma.TransactionWhereInput = {};
    if (q.accountIds && q.accountIds.length > 0) {
      where.accountId = { in: q.accountIds };
    }
    if (q.dateFrom || q.dateTo) {
      where.date = {};
      if (q.dateFrom) (where.date as Prisma.DateTimeFilter).gte = new Date(q.dateFrom);
      if (q.dateTo) (where.date as Prisma.DateTimeFilter).lte = new Date(q.dateTo);
    }

    const sortBy = q.sortBy ?? 'date';
    const sortDir = q.sortDir ?? 'desc';
    const orderBy: Prisma.TransactionOrderByWithRelationInput[] = [
      { [sortBy]: sortDir } as Prisma.TransactionOrderByWithRelationInput,
    ];
    // Stable secondary sort on id desc so same-date rows always come back in
    // the same order (paginating across same-day rows would otherwise jitter).
    if (sortBy !== 'date') orderBy.push({ id: 'desc' });
    else orderBy.push({ id: 'desc' });

    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 200;
    const skip = (page - 1) * pageSize;

    const [items, totalCount] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: { account: { select: { id: true, name: true } } },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { items, totalCount, page, pageSize };
  }
}
```

- [ ] **Step 3: Create the controller**

`backend/src/transactions/transactions.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { ListTransactionsDto } from './dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get() list(@Query() q: ListTransactionsDto) { return this.service.list(q); }
}
```

- [ ] **Step 4: Create the module**

`backend/src/transactions/transactions.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
```

- [ ] **Step 5: Register in `app.module.ts`**.

- [ ] **Step 6: Restart and verify**

```bash
docker compose restart backend
sleep 5
curl -s "http://localhost:4000/transactions?pageSize=10" | python3 -m json.tool
```

Expected: `{ "items": [], "totalCount": 0, "page": 1, "pageSize": 10 }`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/transactions backend/src/app.module.ts
git commit -m "feat(banking): transactions list endpoint with server-side filter/sort/pagination"
```

---

## Task 5: Backend — install papaparse + CSV parser pure function + tests

**Files:**
- Modify: `backend/package.json` (add `papaparse`, `@types/papaparse`)
- Create: `backend/src/transaction-imports/types.ts`
- Create: `backend/src/transaction-imports/csv-parser.service.ts`
- Create: `backend/src/transaction-imports/csv-parser.test.ts`

- [ ] **Step 1: Install papaparse inside the backend container's build context**

```bash
docker compose exec backend npm install papaparse@^5.4.1
docker compose exec backend npm install --save-dev @types/papaparse@^5.3.14
```

Then sync host `package.json`/`package-lock.json` so a rebuild reproduces:

```bash
docker compose cp backend:/app/package.json backend/package.json
docker compose cp backend:/app/package-lock.json backend/package-lock.json
```

- [ ] **Step 2: Create the shared types**

`backend/src/transaction-imports/types.ts`:

```ts
// Shared types for sniffer, parser, controller, and the frontend.
// Persisted verbatim in TransactionImport.mappingJson and reportJson.

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export type ColumnRole =
  | 'date'
  | 'description'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'balance'
  | 'ignore';

export interface ColumnMapping {
  hasHeader: boolean;
  dateFormat: DateFormat;
  columns: ColumnRole[]; // one per CSV column, by index
}

export interface ParsedRow {
  date: string; // YYYY-MM-DD, local calendar
  amount: string; // signed decimal as string, e.g. "-1750.00"
  description: string;
  runningBalance: string | null;
}

export interface ParseError {
  rowIndex: number; // 0-based, after header skip
  reason: string;
  raw: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  parseErrors: ParseError[];
}

export interface MappingSuggestion {
  mapping: ColumnMapping;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string[];
}

export interface ImportReport {
  importId: string;
  accountId: string;
  accountName: string;
  filename: string;
  fileSize: number;
  fileSha256: string;
  importedAt: string;
  mapping: ColumnMapping;
  counts: {
    total: number;
    imported: number;
    duplicates: number;
    failed: number;
  };
  imported: Array<{ date: string; amount: string; description: string }>;
  duplicates: Array<{
    date: string;
    amount: string;
    description: string;
    existingTransactionId: string;
  }>;
  failed: Array<{ rowIndex: number; reason: string; raw: string[] }>;
  warnings: string[];
}
```

- [ ] **Step 3: Write the failing test for the parser**

`backend/src/transaction-imports/csv-parser.test.ts`:

```ts
import { strict as assert } from 'node:assert';
import { parseCsv } from './csv-parser.service';
import { ColumnMapping } from './types';

// Style A: signed amount in one column (matches the attached 1.csv / 2.csv / 3.csv).
function styleAMapping(): ColumnMapping {
  return {
    hasHeader: false,
    dateFormat: 'DD/MM/YYYY',
    columns: ['date', 'amount', 'description', 'balance'],
  };
}

// Style B: separate debit and credit columns.
function styleBMapping(): ColumnMapping {
  return {
    hasHeader: true,
    dateFormat: 'DD/MM/YYYY',
    columns: ['date', 'debit', 'credit', 'description'],
  };
}

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

run('Style A — sample line parses to signed amount and ISO date', () => {
  const buf = Buffer.from(
    '09/05/2026,"+422.04","Transfer from DANIEL LIM NetBank HeraldAveFP 10799","+7510.46"\n',
  );
  const result = parseCsv(buf, styleAMapping());
  assert.equal(result.parseErrors.length, 0);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].date, '2026-05-09');
  assert.equal(result.rows[0].amount, '422.04');
  assert.equal(result.rows[0].description, 'Transfer from DANIEL LIM NetBank HeraldAveFP 10799');
  assert.equal(result.rows[0].runningBalance, '7510.46');
});

run('Style A — debit row preserves negative sign', () => {
  const buf = Buffer.from('08/05/2026,"-1750.00","Mani Dawa","+7088.42"\n');
  const result = parseCsv(buf, styleAMapping());
  assert.equal(result.rows[0].amount, '-1750.00');
});

run('Style A — multiple rows, no header', () => {
  const buf = Buffer.from(
    '09/05/2026,"+422.04","row1","+7510.46"\n08/05/2026,"-1750.00","row2","+7088.42"\n',
  );
  const result = parseCsv(buf, styleAMapping());
  assert.equal(result.rows.length, 2);
});

run('Style B — debit/credit collapses to signed amount', () => {
  const buf = Buffer.from(
    'Date,Debit,Credit,Description\n09/05/2026,,422.04,credit row\n08/05/2026,1750.00,,debit row\n',
  );
  const result = parseCsv(buf, styleBMapping());
  assert.equal(result.rows.length, 2);
  // First row (credit): amount should be +422.04
  assert.equal(result.rows[0].amount, '422.04');
  // Second row (debit): amount should be -1750.00
  assert.equal(result.rows[1].amount, '-1750.00');
});

run('Unparseable date goes to parseErrors, not rows', () => {
  const buf = Buffer.from('not-a-date,"+1.00","row","+1.00"\n');
  const result = parseCsv(buf, styleAMapping());
  assert.equal(result.rows.length, 0);
  assert.equal(result.parseErrors.length, 1);
  assert.match(result.parseErrors[0].reason, /date/i);
});

run('Date uses local calendar — no UTC round-trip drift', () => {
  // 01/01/2026 in DD/MM/YYYY = 2026-01-01. Must NOT become 2025-12-31.
  const buf = Buffer.from('01/01/2026,"+1.00","new year","+1.00"\n');
  const result = parseCsv(buf, styleAMapping());
  assert.equal(result.rows[0].date, '2026-01-01');
});

run('Style A mapping with two amount columns is rejected', () => {
  const bad: ColumnMapping = {
    hasHeader: false,
    dateFormat: 'DD/MM/YYYY',
    columns: ['date', 'amount', 'amount', 'description'],
  };
  assert.throws(() => parseCsv(Buffer.from('01/01/2026,1,2,x\n'), bad), /style|amount/i);
});

run('Mapping with no date column is rejected', () => {
  const bad: ColumnMapping = {
    hasHeader: false,
    dateFormat: 'DD/MM/YYYY',
    columns: ['ignore', 'amount', 'description'],
  };
  assert.throws(() => parseCsv(Buffer.from('a,1.00,x\n'), bad), /date/i);
});
```

- [ ] **Step 4: Run the test, confirm it fails**

```bash
docker compose exec backend npx ts-node src/transaction-imports/csv-parser.test.ts
```

Expected: errors about `parseCsv` not being exported / file not found.

- [ ] **Step 5: Implement the parser**

`backend/src/transaction-imports/csv-parser.service.ts`:

```ts
import Papa from 'papaparse';
import {
  ColumnMapping,
  ColumnRole,
  DateFormat,
  ParseError,
  ParsedRow,
  ParseResult,
} from './types';

// Lowercases, collapses whitespace, trims. Used ONLY for hashing — the
// stored description is the original verbatim string from the file.
export function normaliseDesc(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Validates the mapping shape and throws synchronously with a 422-friendly
// error. The orchestrator catches and re-throws as a Nest HttpException.
function validateMapping(mapping: ColumnMapping): void {
  const counts: Record<ColumnRole, number> = {
    date: 0, description: 0, amount: 0, debit: 0, credit: 0, balance: 0, ignore: 0,
  };
  for (const r of mapping.columns) counts[r]++;

  if (counts.date < 1) throw new Error('Mapping must include exactly one date column');
  if (counts.date > 1) throw new Error('Mapping has more than one date column');
  if (counts.description < 1) throw new Error('Mapping must include at least one description column');
  if (counts.balance > 1) throw new Error('Mapping has more than one balance column');

  const styleA = counts.amount === 1 && counts.debit === 0 && counts.credit === 0;
  const styleB = counts.amount === 0 && counts.debit === 1 && counts.credit === 1;
  if (!styleA && !styleB) {
    throw new Error(
      'Mapping must be Style A (one amount column) or Style B (one debit + one credit column)',
    );
  }
}

function parseDateOrThrow(raw: string, fmt: DateFormat): string {
  const s = raw.trim();
  let m: RegExpMatchArray | null;
  let year: number, month: number, day: number;
  if (fmt === 'DD/MM/YYYY') {
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) throw new Error(`Date "${raw}" does not match DD/MM/YYYY`);
    [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if (fmt === 'MM/DD/YYYY') {
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) throw new Error(`Date "${raw}" does not match MM/DD/YYYY`);
    [month, day, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) throw new Error(`Date "${raw}" does not match YYYY-MM-DD`);
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Date "${raw}" has invalid month/day`);
  }
  // Build YYYY-MM-DD directly from parts — no `new Date()` round-trip
  // (CLAUDE.md gotcha: +08:00 timezone would shift the calendar day back).
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function parseSignedDecimal(raw: string): string {
  // Strip surrounding whitespace and quotes; allow leading +.
  let s = raw.trim().replace(/^"|"$/g, '').trim();
  if (s === '') return '';
  if (s.startsWith('+')) s = s.slice(1);
  // Strip thousands commas. Keep negative sign and decimal point.
  s = s.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Amount "${raw}" is not a decimal`);
  // Normalise to two-decimal-place string for stable hashing.
  return Number(s).toFixed(2);
}

export function parseCsv(buffer: Buffer, mapping: ColumnMapping): ParseResult {
  validateMapping(mapping);

  const text = buffer.toString('utf-8');
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });

  let allRows = parsed.data as string[][];
  if (mapping.hasHeader && allRows.length > 0) allRows = allRows.slice(1);

  const rows: ParsedRow[] = [];
  const parseErrors: ParseError[] = [];

  const colsByRole = new Map<ColumnRole, number>();
  mapping.columns.forEach((role, i) => {
    // Only keep the first index for each role (validateMapping already
    // ensures at most one for the constrained roles).
    if (!colsByRole.has(role)) colsByRole.set(role, i);
  });

  const dateIdx = colsByRole.get('date')!;
  const descIdx = colsByRole.get('description')!;
  const amountIdx = colsByRole.get('amount');
  const debitIdx = colsByRole.get('debit');
  const creditIdx = colsByRole.get('credit');
  const balanceIdx = colsByRole.get('balance');

  allRows.forEach((raw, i) => {
    try {
      const date = parseDateOrThrow(raw[dateIdx] ?? '', mapping.dateFormat);
      let amount: string;
      if (amountIdx !== undefined) {
        amount = parseSignedDecimal(raw[amountIdx] ?? '');
      } else {
        const d = (raw[debitIdx!] ?? '').trim();
        const c = (raw[creditIdx!] ?? '').trim();
        const dn = d === '' ? 0 : Number(parseSignedDecimal(d));
        const cn = c === '' ? 0 : Number(parseSignedDecimal(c));
        amount = (cn - dn).toFixed(2);
      }
      const description = (raw[descIdx] ?? '').trim();
      let runningBalance: string | null = null;
      if (balanceIdx !== undefined) {
        const v = (raw[balanceIdx] ?? '').trim();
        runningBalance = v === '' ? null : parseSignedDecimal(v);
      }
      rows.push({ date, amount, description, runningBalance });
    } catch (e) {
      parseErrors.push({
        rowIndex: i,
        reason: (e as Error).message,
        raw,
      });
    }
  });

  return { rows, parseErrors };
}
```

- [ ] **Step 6: Run the test, confirm it passes**

```bash
docker compose exec backend npx ts-node src/transaction-imports/csv-parser.test.ts
```

Expected: 8 `PASS` lines, no `FAIL`, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/transaction-imports
git commit -m "feat(banking): CSV parser pure function with Style A/B + tests"
```

---

## Task 6: Backend — CSV sniffer + tests

**Files:**
- Create: `backend/src/transaction-imports/csv-sniffer.service.ts`
- Create: `backend/src/transaction-imports/csv-sniffer.test.ts`

- [ ] **Step 1: Write the failing test**

`backend/src/transaction-imports/csv-sniffer.test.ts`:

```ts
import { strict as assert } from 'node:assert';
import { sniffCsv } from './csv-sniffer.service';

function run(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`); console.error(e); process.exitCode = 1; }
}

// Exactly the three rows from the attached samples.
const SAMPLE = Buffer.from(
  '09/05/2026,"+422.04","Transfer from DANIEL LIM NetBank HeraldAveFP 10799","+7510.46"\n' +
  '08/05/2026,"-1750.00","Transfer To Mani Dawa","+7088.42"\n' +
  '07/05/2026,"-538.43","Direct Debit PAYPAL AUSTRALIA","+10384.42"\n'
);

run('Sample CSV sniffs as Style A, DD/MM/YYYY, no header, confidence high', () => {
  const s = sniffCsv(SAMPLE);
  assert.equal(s.mapping.hasHeader, false);
  assert.equal(s.mapping.dateFormat, 'DD/MM/YYYY');
  assert.deepEqual(s.mapping.columns, ['date', 'amount', 'description', 'balance']);
  assert.equal(s.confidence, 'high');
});

run('Header row is detected', () => {
  const buf = Buffer.from(
    'Date,Amount,Description,Balance\n09/05/2026,+422.04,foo,+7510.46\n',
  );
  const s = sniffCsv(buf);
  assert.equal(s.mapping.hasHeader, true);
});

run('Style B (debit + credit) detected when no signed column dominates', () => {
  const buf = Buffer.from(
    'Date,Debit,Credit,Description\n01/01/2026,,422.04,row1\n02/01/2026,1750.00,,row2\n03/01/2026,,100.00,row3\n',
  );
  const s = sniffCsv(buf);
  assert.equal(s.mapping.hasHeader, true);
  assert.ok(s.mapping.columns.includes('debit'));
  assert.ok(s.mapping.columns.includes('credit'));
  assert.ok(!s.mapping.columns.includes('amount'));
});
```

- [ ] **Step 2: Run, confirm it fails (no sniffCsv exported yet)**

```bash
docker compose exec backend npx ts-node src/transaction-imports/csv-sniffer.test.ts
```

Expected: module-not-found / no-export errors.

- [ ] **Step 3: Implement the sniffer**

`backend/src/transaction-imports/csv-sniffer.service.ts`:

```ts
import Papa from 'papaparse';
import { ColumnMapping, ColumnRole, DateFormat, MappingSuggestion } from './types';

function tryParseDate(value: string, fmt: DateFormat): boolean {
  const s = value.trim();
  if (fmt === 'DD/MM/YYYY' || fmt === 'MM/DD/YYYY') return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s);
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(s);
}

function tryParseSignedDecimal(value: string): boolean {
  const s = value.trim().replace(/^"|"$/g, '').replace(/^\+/, '').replace(/,/g, '');
  return /^-?\d+(\.\d+)?$/.test(s) && s !== '';
}

function isTextish(value: string): boolean {
  return /[a-zA-Z]/.test(value);
}

export function sniffCsv(buffer: Buffer): MappingSuggestion {
  const text = buffer.toString('utf-8');
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const matrix = parsed.data as string[][];
  if (matrix.length === 0) {
    throw new Error('CSV contains no data rows');
  }

  const ncols = Math.max(...matrix.map((r) => r.length));
  const reasoning: string[] = [];

  // Determine which date format works best across all rows of column 0.
  function scoreDateFmt(colIdx: number, fmt: DateFormat, rows: string[][]): number {
    if (rows.length === 0) return 0;
    const hits = rows.filter((r) => tryParseDate(r[colIdx] ?? '', fmt)).length;
    return hits / rows.length;
  }

  // Header detection: tentatively try with full data, then with first row stripped.
  // The "data" half should score >> the "header" half for at least one column.
  function bestDateFormatFor(rows: string[][], colIdx: number): { fmt: DateFormat; score: number } {
    const formats: DateFormat[] = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
    let best = { fmt: 'DD/MM/YYYY' as DateFormat, score: 0 };
    for (const fmt of formats) {
      const s = scoreDateFmt(colIdx, fmt, rows);
      if (s > best.score) best = { fmt, score: s };
    }
    return best;
  }

  // Step 1: detect header by checking if row 0's parseability against any format
  // is dramatically lower than the rest.
  let hasHeader = false;
  if (matrix.length >= 2) {
    const firstRow = [matrix[0]];
    const restRows = matrix.slice(1);
    let firstRowDateHit = false;
    let restRowDateHit = false;
    for (let c = 0; c < ncols; c++) {
      const f = bestDateFormatFor(firstRow, c).score;
      const r = bestDateFormatFor(restRows, c).score;
      if (f >= 0.5) firstRowDateHit = true;
      if (r >= 0.8) restRowDateHit = true;
    }
    if (restRowDateHit && !firstRowDateHit) {
      hasHeader = true;
      reasoning.push('Row 0 has no parseable dates; subsequent rows do — treating as header.');
    }
  }

  const dataRows = hasHeader ? matrix.slice(1) : matrix;

  // Step 2: per-column scoring.
  type Scores = { date: { fmt: DateFormat; score: number }; amount: number; balance: number; text: number };
  const colScores: Scores[] = [];
  for (let c = 0; c < ncols; c++) {
    const dateScore = bestDateFormatFor(dataRows, c);
    const amountHits = dataRows.filter((r) => tryParseSignedDecimal(r[c] ?? '')).length;
    const amountScore = dataRows.length ? amountHits / dataRows.length : 0;
    const textHits = dataRows.filter((r) => isTextish(r[c] ?? '')).length;
    const textScore = dataRows.length ? textHits / dataRows.length : 0;

    // Balance signature: looks like a decimal AND values change monotonically
    // (running balance is rarely constant for two rows in a row).
    let balanceScore = 0;
    if (amountScore > 0.8) {
      const nums = dataRows.map((r) => Number((r[c] ?? '').replace(/^"|"$/g, '').replace(/^\+/, '').replace(/,/g, '')));
      const changes = nums.slice(1).filter((v, i) => Math.abs(v - nums[i]) > 0.005).length;
      balanceScore = dataRows.length > 1 ? changes / (dataRows.length - 1) : 0;
    }

    colScores.push({ date: dateScore, amount: amountScore, balance: balanceScore, text: textScore });
  }

  // Step 3: assign roles. Pick best date column first, then balance (highest
  // balance score over 0.7 among amount-like columns OTHER than the date col),
  // then amount/debit/credit, then description.
  const roles: ColumnRole[] = new Array(ncols).fill('ignore');

  // Date
  let dateIdx = -1;
  let dateFmt: DateFormat = 'DD/MM/YYYY';
  let bestDate = 0;
  for (let c = 0; c < ncols; c++) {
    if (colScores[c].date.score > bestDate) {
      bestDate = colScores[c].date.score;
      dateIdx = c;
      dateFmt = colScores[c].date.fmt;
    }
  }
  if (dateIdx >= 0) {
    roles[dateIdx] = 'date';
    reasoning.push(`Col ${dateIdx}: date in ${dateFmt} (score ${bestDate.toFixed(2)})`);
  }

  // Amount candidates = columns with amountScore > 0.8 that aren't the date column.
  const amountCandidates = colScores
    .map((s, c) => ({ c, s }))
    .filter(({ c, s }) => c !== dateIdx && s.amount > 0.8)
    .sort((a, b) => b.s.amount - a.s.amount);

  if (amountCandidates.length >= 2) {
    // Pick the most-likely balance column = highest balanceScore among the candidates.
    const balancePick = [...amountCandidates].sort((a, b) => b.s.balance - a.s.balance)[0];
    // Pick amount = the candidate with the LOWEST balance score (transactions
    // jump up and down; running balance trends).
    const remaining = amountCandidates.filter((x) => x.c !== balancePick.c);
    const amountPick = remaining[0];
    if (balancePick.s.balance > 0.7) {
      roles[balancePick.c] = 'balance';
      reasoning.push(`Col ${balancePick.c}: running balance (changes every row)`);
    }
    if (amountPick) {
      roles[amountPick.c] = 'amount';
      reasoning.push(`Col ${amountPick.c}: signed amount`);
    }
  } else if (amountCandidates.length === 1) {
    roles[amountCandidates[0].c] = 'amount';
    reasoning.push(`Col ${amountCandidates[0].c}: signed amount`);
  } else {
    // No single signed-amount column. Look for two adjacent columns that
    // together look like a debit/credit split — at least one row has only
    // one of the two populated.
    for (let a = 0; a < ncols; a++) {
      for (let b = a + 1; b < ncols; b++) {
        if (a === dateIdx || b === dateIdx) continue;
        const eitherPopulated = dataRows.filter((r) => {
          const ra = (r[a] ?? '').trim();
          const rb = (r[b] ?? '').trim();
          return (ra !== '' && rb === '') || (ra === '' && rb !== '');
        }).length;
        if (dataRows.length > 0 && eitherPopulated / dataRows.length > 0.5) {
          // Assume the first of the two columns is debit, second is credit.
          // Real-world AU bank exports almost always order them that way.
          roles[a] = 'debit';
          roles[b] = 'credit';
          reasoning.push(`Cols ${a}/${b}: debit/credit split`);
          break;
        }
      }
      if (roles.includes('debit')) break;
    }
  }

  // Description = highest textScore among remaining columns.
  let descIdx = -1;
  let bestText = 0;
  for (let c = 0; c < ncols; c++) {
    if (roles[c] !== 'ignore') continue;
    if (colScores[c].text > bestText) {
      bestText = colScores[c].text;
      descIdx = c;
    }
  }
  if (descIdx >= 0) {
    roles[descIdx] = 'description';
    reasoning.push(`Col ${descIdx}: description (textScore ${bestText.toFixed(2)})`);
  }

  // Confidence: high if every assigned role except ignore scored above 0.9.
  const allAssigned = roles
    .map((role, c) => ({ role, c }))
    .filter((x) => x.role !== 'ignore');
  function scoreFor(role: ColumnRole, c: number): number {
    if (role === 'date') return colScores[c].date.score;
    if (role === 'amount' || role === 'debit' || role === 'credit') return colScores[c].amount;
    if (role === 'balance') return colScores[c].balance;
    if (role === 'description') return colScores[c].text;
    return 0;
  }
  const minScore = allAssigned.length
    ? Math.min(...allAssigned.map((x) => scoreFor(x.role, x.c)))
    : 0;
  const confidence: 'high' | 'medium' | 'low' =
    minScore >= 0.9 ? 'high' : minScore >= 0.6 ? 'medium' : 'low';

  const mapping: ColumnMapping = { hasHeader, dateFormat: dateFmt, columns: roles };
  return { mapping, confidence, reasoning };
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
docker compose exec backend npx ts-node src/transaction-imports/csv-sniffer.test.ts
```

Expected: 3 `PASS` lines.

- [ ] **Step 5: Smoke-test on the actual attached CSVs**

```bash
docker compose cp /home/reallybasic/Projects/Accounting/temp/. backend:/tmp/banking-samples/ 2>/dev/null || \
  docker compose exec backend mkdir -p /tmp/banking-samples
# Falls back to manually copying — the test files live where the user attached them:
docker cp /home/reallybasic/Projects/Accounting/temp/screenshots simplebooks-backend-1:/tmp/banking-samples/ 2>/dev/null || true
```

Then write a one-off probe (no need to commit it):

```bash
docker compose exec backend bash -c "cat > /tmp/probe.ts <<'EOF'
import * as fs from 'fs';
import { sniffCsv } from './src/transaction-imports/csv-sniffer.service';
const buf = fs.readFileSync(process.argv[2]);
console.log(JSON.stringify(sniffCsv(buf), null, 2));
EOF
npx ts-node /tmp/probe.ts /tmp/banking-samples/1.csv 2>/dev/null || echo 'place CSV at /tmp/banking-samples/1.csv first'"
```

Skip this step if the sample files aren't available in the container; the unit test already covers the case. Just confirm the previous test PASSes.

- [ ] **Step 6: Commit**

```bash
git add backend/src/transaction-imports/csv-sniffer.service.ts backend/src/transaction-imports/csv-sniffer.test.ts
git commit -m "feat(banking): CSV sniffer for Style A/B + header detection + tests"
```

---

## Task 7: Backend — Transaction-imports module (sniff + commit + report)

**Files:**
- Create: `backend/src/transaction-imports/transaction-imports.module.ts`
- Create: `backend/src/transaction-imports/transaction-imports.controller.ts`
- Create: `backend/src/transaction-imports/transaction-imports.service.ts`
- Create: `backend/src/transaction-imports/dto.ts`
- Create: `backend/src/transaction-imports/hash.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create the hash helper**

`backend/src/transaction-imports/hash.ts`:

```ts
import { createHash } from 'node:crypto';
import { normaliseDesc } from './csv-parser.service';

// Per the spec: sha256 of date|amount.toFixed(2)|normaliseDesc(description)|runningBalance ?? ''
export function rowImportHash(
  date: string,
  amount: string,
  description: string,
  runningBalance: string | null,
): string {
  const payload = [date, amount, normaliseDesc(description), runningBalance ?? ''].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export function fileSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
```

- [ ] **Step 2: Create the DTO**

`backend/src/transaction-imports/dto.ts`:

```ts
import { IsString, IsUUID, IsOptional } from 'class-validator';

// /commit accepts multipart: a file + these JSON-ish form fields.
// `mapping` arrives as a JSON-stringified ColumnMapping (because multipart
// fields are strings); the controller JSON.parses it before passing in.
export class CommitImportDto {
  @IsUUID() accountId!: string;
  @IsString() fileSha256!: string;
  @IsString() mapping!: string;
  @IsString() @IsOptional() filename?: string;
}
```

- [ ] **Step 3: Create the service**

`backend/src/transaction-imports/transaction-imports.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseCsv } from './csv-parser.service';
import { sniffCsv } from './csv-sniffer.service';
import { fileSha256, rowImportHash } from './hash';
import { ColumnMapping, ImportReport, MappingSuggestion } from './types';

const MAX_BYTES = 10 * 1024 * 1024;

@Injectable()
export class TransactionImportsService {
  constructor(private prisma: PrismaService) {}

  async sniff(buffer: Buffer, accountId: string, filename: string): Promise<{
    previewRows: string[][];
    suggestedMapping: MappingSuggestion;
    fileSha256: string;
    alreadyImportedAs?: string;
    fileSize: number;
    filename: string;
  }> {
    if (buffer.length > MAX_BYTES) throw new BadRequestException('File exceeds 10 MB');
    const acct = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acct) throw new NotFoundException('Account not found');

    const sha = fileSha256(buffer);
    const Papa = require('papaparse');
    const parsed = Papa.parse<string[]>(buffer.toString('utf-8'), { skipEmptyLines: true });
    const matrix: string[][] = parsed.data;
    const previewRows = matrix.slice(0, 5);
    const suggestedMapping = sniffCsv(buffer);

    const prior = await this.prisma.transactionImport.findFirst({
      where: { accountId, fileSha256: sha },
      orderBy: { importedAt: 'desc' },
      select: { id: true },
    });

    return {
      previewRows,
      suggestedMapping,
      fileSha256: sha,
      alreadyImportedAs: prior?.id,
      fileSize: buffer.length,
      filename,
    };
  }

  async commit(
    buffer: Buffer,
    accountId: string,
    expectedSha: string,
    mapping: ColumnMapping,
    filename: string,
  ): Promise<ImportReport> {
    if (buffer.length > MAX_BYTES) throw new BadRequestException('File exceeds 10 MB');
    const sha = fileSha256(buffer);
    if (sha !== expectedSha) throw new BadRequestException('File hash mismatch — re-upload required');

    const acct = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acct) throw new NotFoundException('Account not found');

    let parsed;
    try {
      parsed = parseCsv(buffer, mapping);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const { rows, parseErrors } = parsed;

    // Compute importHashes for every row up-front.
    const hashed = rows.map((r) => ({
      ...r,
      importHash: rowImportHash(r.date, r.amount, r.description, r.runningBalance),
    }));

    // Running-balance self-consistency check across consecutive pairs in the
    // file (sort by date asc + file order so the math lines up regardless of
    // whether the CSV is oldest-first or newest-first).
    const warnings: string[] = [];
    const dateSorted = [...hashed]
      .map((r, i) => ({ r, i }))
      .sort((a, b) => a.r.date.localeCompare(b.r.date) || a.i - b.i);
    for (let k = 1; k < dateSorted.length; k++) {
      const prev = dateSorted[k - 1].r;
      const curr = dateSorted[k].r;
      if (prev.runningBalance && curr.runningBalance) {
        const expected = Number(prev.runningBalance) + Number(curr.amount);
        const actual = Number(curr.runningBalance);
        if (Math.abs(expected - actual) > 0.01) {
          warnings.push(
            `Rows around ${curr.date}: balance jump $${actual.toFixed(2)} does not match expected $${expected.toFixed(2)} (diff $${(actual - expected).toFixed(2)})`,
          );
        }
      }
    }

    // Detect file-already-imported for the warnings list.
    const prior = await this.prisma.transactionImport.findFirst({
      where: { accountId, fileSha256: sha },
      orderBy: { importedAt: 'desc' },
      select: { id: true, importedAt: true },
    });
    if (prior) {
      warnings.unshift(
        `This exact file was already imported on ${prior.importedAt.toISOString().slice(0, 10)} (import ${prior.id}). Only new rows will be inserted.`,
      );
    }

    const importedAt = new Date();

    const { importRow, importedRows, duplicateRows } = await this.prisma.$transaction(async (tx) => {
      const importRow = await tx.transactionImport.create({
        data: {
          accountId,
          filename,
          fileSize: buffer.length,
          fileSha256: sha,
          importedAt,
          mappingJson: mapping as unknown as Prisma.InputJsonValue,
          rowsTotal: rows.length + parseErrors.length,
          rowsImported: 0,
          rowsSkippedDup: 0,
          rowsFailed: parseErrors.length,
          reportJson: {} as unknown as Prisma.InputJsonValue, // filled in after insert
        },
      });

      // Insert with skipDuplicates so the unique index drops dupes server-side.
      await tx.transaction.createMany({
        data: hashed.map((r) => ({
          accountId,
          date: new Date(r.date),
          amount: new Prisma.Decimal(r.amount),
          description: r.description,
          runningBalance: r.runningBalance ? new Prisma.Decimal(r.runningBalance) : null,
          importHash: r.importHash,
          importId: importRow.id,
        })),
        skipDuplicates: true,
      });

      // Re-query: which of the input hashes are now stamped with THIS import id?
      const justInserted = await tx.transaction.findMany({
        where: { importId: importRow.id },
        select: { importHash: true },
      });
      const insertedHashes = new Set(justInserted.map((t) => t.importHash));
      const inputHashes = hashed.map((r) => r.importHash);

      // Duplicates = input rows whose hash exists in DB but not stamped with this importId.
      const dupeHashes = inputHashes.filter((h) => !insertedHashes.has(h));
      const existingDupes = await tx.transaction.findMany({
        where: { accountId, importHash: { in: dupeHashes } },
        select: { id: true, importHash: true },
      });
      const existingByHash = new Map(existingDupes.map((t) => [t.importHash, t.id]));

      const importedRows = hashed.filter((r) => insertedHashes.has(r.importHash));
      const duplicateRows = hashed
        .filter((r) => !insertedHashes.has(r.importHash))
        .map((r) => ({
          date: r.date,
          amount: r.amount,
          description: r.description,
          existingTransactionId: existingByHash.get(r.importHash) ?? '',
        }));

      await tx.transactionImport.update({
        where: { id: importRow.id },
        data: {
          rowsImported: importedRows.length,
          rowsSkippedDup: duplicateRows.length,
        },
      });

      return { importRow, importedRows, duplicateRows };
    });

    const report: ImportReport = {
      importId: importRow.id,
      accountId,
      accountName: acct.name,
      filename,
      fileSize: buffer.length,
      fileSha256: sha,
      importedAt: importedAt.toISOString(),
      mapping,
      counts: {
        total: rows.length + parseErrors.length,
        imported: importedRows.length,
        duplicates: duplicateRows.length,
        failed: parseErrors.length,
      },
      imported: importedRows.map((r) => ({ date: r.date, amount: r.amount, description: r.description })),
      duplicates: duplicateRows,
      failed: parseErrors,
      warnings,
    };

    await this.prisma.transactionImport.update({
      where: { id: importRow.id },
      data: { reportJson: report as unknown as Prisma.InputJsonValue },
    });

    return report;
  }
}
```

- [ ] **Step 4: Create the controller**

`backend/src/transaction-imports/transaction-imports.controller.ts`:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TransactionImportsService } from './transaction-imports.service';
import { CommitImportDto } from './dto';
import { ColumnMapping } from './types';

@Controller('transaction-imports')
export class TransactionImportsController {
  constructor(private service: TransactionImportsService) {}

  @Post('sniff')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @HttpCode(200)
  async sniff(
    @UploadedFile() file: Express.Multer.File,
    @Body('accountId') accountId: string,
  ) {
    if (!file) throw new BadRequestException('file is required');
    if (!accountId) throw new BadRequestException('accountId is required');
    return this.service.sniff(file.buffer, accountId, file.originalname);
  }

  @Post('commit')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @HttpCode(200)
  async commit(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CommitImportDto,
  ) {
    if (!file) throw new BadRequestException('file is required');
    let mapping: ColumnMapping;
    try {
      mapping = JSON.parse(body.mapping);
    } catch {
      throw new BadRequestException('mapping must be a JSON-stringified ColumnMapping');
    }
    return this.service.commit(
      file.buffer,
      body.accountId,
      body.fileSha256,
      mapping,
      body.filename ?? file.originalname,
    );
  }
}
```

- [ ] **Step 5: Create the module**

`backend/src/transaction-imports/transaction-imports.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TransactionImportsController } from './transaction-imports.controller';
import { TransactionImportsService } from './transaction-imports.service';

@Module({
  controllers: [TransactionImportsController],
  providers: [TransactionImportsService],
  exports: [TransactionImportsService],
})
export class TransactionImportsModule {}
```

- [ ] **Step 6: Register in `app.module.ts`** — `import { TransactionImportsModule } from './transaction-imports/transaction-imports.module';` and add to `imports`.

- [ ] **Step 7: Restart and end-to-end verify with the attached CSVs**

```bash
docker compose restart backend
sleep 5
ACCT=$(curl -s http://localhost:4000/accounts | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
echo "Account: $ACCT"

# Sniff
curl -s -X POST http://localhost:4000/transaction-imports/sniff \
  -F "file=@/home/reallybasic/Projects/Accounting/temp/1.csv" \
  -F "accountId=$ACCT" | python3 -m json.tool | head -40
```

(If `temp/1.csv` doesn't exist, save the content provided in the original chat to `temp/1.csv` first.)

Expected: response includes `previewRows` (first 5), `suggestedMapping.confidence: "high"`, `fileSha256`.

```bash
# Commit (the mapping has to match sniff's suggestion exactly):
SHA=$(curl -s -X POST http://localhost:4000/transaction-imports/sniff \
  -F "file=@/home/reallybasic/Projects/Accounting/temp/1.csv" \
  -F "accountId=$ACCT" | python3 -c "import sys,json; print(json.load(sys.stdin)['fileSha256'])")
MAPPING='{"hasHeader":false,"dateFormat":"DD/MM/YYYY","columns":["date","amount","description","balance"]}'
curl -s -X POST http://localhost:4000/transaction-imports/commit \
  -F "file=@/home/reallybasic/Projects/Accounting/temp/1.csv" \
  -F "accountId=$ACCT" \
  -F "fileSha256=$SHA" \
  -F "mapping=$MAPPING" | python3 -m json.tool | head -30
```

Expected: report with `counts.imported: 13`, `counts.duplicates: 0`, `counts.failed: 0`.

```bash
# Re-importing the same file should mark everything as duplicate.
curl -s -X POST http://localhost:4000/transaction-imports/commit \
  -F "file=@/home/reallybasic/Projects/Accounting/temp/1.csv" \
  -F "accountId=$ACCT" \
  -F "fileSha256=$SHA" \
  -F "mapping=$MAPPING" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r['counts'])"
```

Expected: `{'total': 13, 'imported': 0, 'duplicates': 13, 'failed': 0}` and `warnings` includes the "already imported" notice.

- [ ] **Step 8: Commit**

```bash
git add backend/src/transaction-imports backend/src/app.module.ts
git commit -m "feat(banking): transaction-imports sniff + commit with dedup + report"
```

---

## Task 8: Backend — Import-logs module (read-only)

**Files:**
- Create: `backend/src/import-logs/import-logs.module.ts`
- Create: `backend/src/import-logs/import-logs.controller.ts`
- Create: `backend/src/import-logs/import-logs.service.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create the service**

`backend/src/import-logs/import-logs.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ImportLogsService {
  constructor(private prisma: PrismaService) {}

  async list(q: { accountId?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }) {
    const where: any = {};
    if (q.accountId) where.accountId = q.accountId;
    if (q.dateFrom || q.dateTo) {
      where.importedAt = {};
      if (q.dateFrom) where.importedAt.gte = new Date(q.dateFrom);
      if (q.dateTo) where.importedAt.lte = new Date(q.dateTo);
    }
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 100;
    const [items, totalCount] = await Promise.all([
      this.prisma.transactionImport.findMany({
        where,
        orderBy: { importedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        // Omit reportJson from the list response — small payload.
        select: {
          id: true,
          accountId: true,
          filename: true,
          fileSize: true,
          importedAt: true,
          rowsTotal: true,
          rowsImported: true,
          rowsSkippedDup: true,
          rowsFailed: true,
          account: { select: { id: true, name: true } },
        },
      }),
      this.prisma.transactionImport.count({ where }),
    ]);
    return { items, totalCount, page, pageSize };
  }

  async get(id: string) {
    const row = await this.prisma.transactionImport.findUnique({
      where: { id },
      include: { account: { select: { id: true, name: true } } },
    });
    if (!row) throw new NotFoundException();
    return row;
  }
}
```

- [ ] **Step 2: Create the controller**

`backend/src/import-logs/import-logs.controller.ts`:

```ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ImportLogsService } from './import-logs.service';

@Controller('import-logs')
export class ImportLogsController {
  constructor(private service: ImportLogsService) {}

  @Get()
  list(
    @Query('accountId') accountId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.list({
      accountId,
      dateFrom,
      dateTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
}
```

- [ ] **Step 3: Create the module**

`backend/src/import-logs/import-logs.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ImportLogsController } from './import-logs.controller';
import { ImportLogsService } from './import-logs.service';

@Module({
  controllers: [ImportLogsController],
  providers: [ImportLogsService],
  exports: [ImportLogsService],
})
export class ImportLogsModule {}
```

- [ ] **Step 4: Register in `app.module.ts`**.

- [ ] **Step 5: Restart and verify**

```bash
docker compose restart backend
sleep 5
curl -s http://localhost:4000/import-logs | python3 -m json.tool | head -20
```

Expected: items array with the two imports from Task 7's verification, no `reportJson` in the list response.

```bash
LOG_ID=$(curl -s http://localhost:4000/import-logs | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['id'])")
curl -s http://localhost:4000/import-logs/$LOG_ID | python3 -m json.tool | head -50
```

Expected: full record with `reportJson` populated.

- [ ] **Step 6: Commit**

```bash
git add backend/src/import-logs backend/src/app.module.ts
git commit -m "feat(banking): import-logs read-only endpoints"
```

---

## Task 9: Frontend — types and api helpers

**Files:**
- Modify: `frontend/lib/types.ts` (append)
- Modify: `frontend/lib/api.ts` (extend with banking helpers — keep the existing apiClient signature)
- Create: `frontend/lib/banking.ts` (typed wrappers for banking endpoints)

- [ ] **Step 1: Append types**

Append to `frontend/lib/types.ts`:

```ts
// ── Banking ─────────────────────────────────────────────────────────────────

export type AccountType = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Account = {
  id: string;
  name: string;
  bank: string;
  accountNumber?: string | null;
  accountTypeId: string;
  accountType?: AccountType;
  openingBalance: string;
  openingDate: string;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Computed (list + detail include these).
  currentBalance?: string;
  _count?: { transactions: number; imports?: number };
  latestImport?: { id: string; importedAt: string; rowsImported: number } | null;
};

export type Transaction = {
  id: string;
  accountId: string;
  account?: { id: string; name: string };
  date: string;
  amount: string;
  description: string;
  runningBalance?: string | null;
  importHash: string;
  importId?: string | null;
  categoryId?: string | null;
  vendorCustomerId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TransactionListResponse = {
  items: Transaction[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type ColumnRole =
  | 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'balance' | 'ignore';
export const COLUMN_ROLES: { value: ColumnRole; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'description', label: 'Description' },
  { value: 'amount', label: 'Amount (signed)' },
  { value: 'debit', label: 'Debit' },
  { value: 'credit', label: 'Credit' },
  { value: 'balance', label: 'Balance' },
  { value: 'ignore', label: 'Ignore' },
];
export const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (AU)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (US)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO)' },
];

export type ColumnMapping = {
  hasHeader: boolean;
  dateFormat: DateFormat;
  columns: ColumnRole[];
};

export type MappingSuggestion = {
  mapping: ColumnMapping;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string[];
};

export type SniffResponse = {
  previewRows: string[][];
  suggestedMapping: MappingSuggestion;
  fileSha256: string;
  alreadyImportedAs?: string;
  fileSize: number;
  filename: string;
};

export type ImportReport = {
  importId: string;
  accountId: string;
  accountName: string;
  filename: string;
  fileSize: number;
  fileSha256: string;
  importedAt: string;
  mapping: ColumnMapping;
  counts: { total: number; imported: number; duplicates: number; failed: number };
  imported: Array<{ date: string; amount: string; description: string }>;
  duplicates: Array<{
    date: string;
    amount: string;
    description: string;
    existingTransactionId: string;
  }>;
  failed: Array<{ rowIndex: number; reason: string; raw: string[] }>;
  warnings: string[];
};

export type ImportLogSummary = {
  id: string;
  accountId: string;
  account: { id: string; name: string };
  filename: string;
  fileSize: number;
  importedAt: string;
  rowsTotal: number;
  rowsImported: number;
  rowsSkippedDup: number;
  rowsFailed: number;
};

export type ImportLogFull = ImportLogSummary & {
  reportJson: ImportReport;
  mappingJson: ColumnMapping;
  fileSha256: string;
};
```

- [ ] **Step 2: Add a multipart helper to `lib/api.ts`**

Append to `frontend/lib/api.ts`:

```ts
// Multipart helper for CSV import endpoints. `formData` is constructed by the
// caller (browser-side only — these endpoints are never hit during SSR).
export async function apiMultipart<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { method: 'POST', body: formData, cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}
```

- [ ] **Step 3: Create `lib/banking.ts`**

`frontend/lib/banking.ts`:

```ts
import { apiClient, apiMultipart } from './api';
import type {
  Account, AccountType, ColumnMapping, ImportLogFull, ImportLogSummary,
  ImportReport, SniffResponse, Transaction, TransactionListResponse,
} from './types';

// Accounts
export const listAccounts = (includeInactive = false) =>
  apiClient.get<Account[]>(`/accounts${includeInactive ? '?includeInactive=true' : ''}`);
export const getAccount = (id: string) => apiClient.get<Account>(`/accounts/${id}`);
export const createAccount = (data: any) => apiClient.post<Account>('/accounts', data);
export const updateAccount = (id: string, data: any) => apiClient.patch<Account>(`/accounts/${id}`, data);
export const archiveAccount = (id: string) => apiClient.patch<Account>(`/accounts/${id}/archive`, {});
export const restoreAccount = (id: string) => apiClient.patch<Account>(`/accounts/${id}/restore`, {});

// AccountTypes
export const listAccountTypes = () => apiClient.get<AccountType[]>('/account-types');
export const createAccountType = (data: { name: string; isActive?: boolean }) =>
  apiClient.post<AccountType>('/account-types', data);
export const updateAccountType = (id: string, data: { name?: string; isActive?: boolean }) =>
  apiClient.patch<AccountType>(`/account-types/${id}`, data);
export const deleteAccountType = (id: string) => apiClient.delete<{ ok: true }>(`/account-types/${id}`);

// Transactions
export const listTransactions = (params: {
  accountIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}) => {
  const search = new URLSearchParams();
  if (params.accountIds?.length) search.set('accountIds', params.accountIds.join(','));
  if (params.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params.dateTo) search.set('dateTo', params.dateTo);
  if (params.sortBy) search.set('sortBy', params.sortBy);
  if (params.sortDir) search.set('sortDir', params.sortDir);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  const qs = search.toString();
  return apiClient.get<TransactionListResponse>(`/transactions${qs ? '?' + qs : ''}`);
};

// CSV import
export const sniffCsv = (file: File, accountId: string) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('accountId', accountId);
  return apiMultipart<SniffResponse>('/transaction-imports/sniff', fd);
};
export const commitImport = (
  file: File,
  accountId: string,
  fileSha256: string,
  mapping: ColumnMapping,
) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('accountId', accountId);
  fd.append('fileSha256', fileSha256);
  fd.append('mapping', JSON.stringify(mapping));
  fd.append('filename', file.name);
  return apiMultipart<ImportReport>('/transaction-imports/commit', fd);
};

// Import logs
export const listImportLogs = (params: { accountId?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number } = {}) => {
  const search = new URLSearchParams();
  if (params.accountId) search.set('accountId', params.accountId);
  if (params.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params.dateTo) search.set('dateTo', params.dateTo);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  const qs = search.toString();
  return apiClient.get<{ items: ImportLogSummary[]; totalCount: number }>(`/import-logs${qs ? '?' + qs : ''}`);
};
export const getImportLog = (id: string) => apiClient.get<ImportLogFull>(`/import-logs/${id}`);
```

- [ ] **Step 4: Commit (no need to restart frontend yet; nothing imports these files yet)**

```bash
git add frontend/lib/types.ts frontend/lib/api.ts frontend/lib/banking.ts
git commit -m "feat(banking): frontend types + api helpers"
```

---

## Task 10: Frontend — Accounts list page

**Files:**
- Replace: `frontend/app/accounts/page.tsx`
- Create: `frontend/components/accounts/accounts-list.tsx`

- [ ] **Step 1: Server-component page**

Replace `frontend/app/accounts/page.tsx`:

```tsx
import { AccountsList } from "@/components/accounts/accounts-list";
import { listAccounts } from "@/lib/banking";

export default async function Page() {
  const accounts = await listAccounts(true);
  return <AccountsList initial={accounts} />;
}
```

- [ ] **Step 2: Client list component**

`frontend/components/accounts/accounts-list.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  FilteredList,
  textIncludes,
  selectMatches,
  type FilterFieldDef,
} from "@/components/data/filtered-list";
import type { Column } from "@/components/data/list-table";
import type { Account } from "@/lib/types";

const columns: Column<Account>[] = [
  {
    key: "name",
    label: "Account",
    render: (r) => <span className="font-medium text-slate-900">{r.name}</span>,
    width: "1.5fr",
    sortValue: (r) => r.name,
  },
  {
    key: "bank",
    label: "Bank",
    render: (r) => <span className="text-slate-600">{r.bank}</span>,
    width: "1fr",
    sortValue: (r) => r.bank,
  },
  {
    key: "type",
    label: "Type",
    render: (r) => <span className="text-slate-600">{r.accountType?.name ?? "—"}</span>,
    width: "0.8fr",
    sortValue: (r) => r.accountType?.name ?? "",
  },
  {
    key: "balance",
    label: "Current balance",
    align: "right",
    render: (r) => (
      <span className="font-mono tabular-nums text-slate-900">
        ${Number(r.currentBalance ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    ),
    width: "0.9fr",
    sortValue: (r) => Number(r.currentBalance ?? 0),
  },
  {
    key: "txns",
    label: "Transactions",
    align: "right",
    render: (r) => (
      <span className="font-mono tabular-nums text-slate-500">
        {r._count?.transactions ?? 0}
      </span>
    ),
    width: "0.7fr",
    sortValue: (r) => r._count?.transactions ?? 0,
  },
  {
    key: "status",
    label: "Status",
    align: "center",
    render: (r) => <Badge tone={r.isActive ? "completed" : "cancelled"}>{r.isActive ? "Active" : "Archived"}</Badge>,
    width: "120px",
    sortValue: (r) => r.isActive,
  },
];

export function AccountsList({ initial }: { initial: Account[] }) {
  const filterFields: FilterFieldDef[] = useMemo(
    () => [
      { key: "name", label: "Name", type: "text", placeholder: "Search by name…" },
      { key: "bank", label: "Bank", type: "text", placeholder: "Search by bank…" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
        ],
      },
    ],
    [],
  );

  return (
    <FilteredList<Account>
      title="Accounts"
      rows={initial}
      columns={columns}
      rowHref={(r) => `/accounts/${r.id}`}
      newHref="/accounts/new"
      newLabel="New account"
      emptyMessage="No accounts yet."
      filterFields={filterFields}
      filterFn={(r, v) =>
        textIncludes(r.name, v.name ?? "") &&
        textIncludes(r.bank, v.bank ?? "") &&
        (!v.status || v.status === "__all__"
          ? true
          : v.status === "active"
            ? r.isActive
            : !r.isActive)
      }
      defaultSort={{ key: "status", direction: "asc" }}
      tieBreakerKey="name"
    />
  );
}
```

- [ ] **Step 3: Verify in browser**

```bash
docker compose restart frontend
sleep 8
# Open http://localhost:3000/accounts in a browser — must show the two seeded accounts.
curl -s http://localhost:3000/accounts | grep -c "CBA Smart Access" || true
```

Expected: two accounts visible, columns: Account / Bank / Type / Current balance / Transactions / Status. Filter + sort work.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/accounts/page.tsx frontend/components/accounts/accounts-list.tsx
git commit -m "feat(banking): accounts list page"
```

---

## Task 11: Frontend — Accounts create + edit pages

**Files:**
- Create: `frontend/app/accounts/new/page.tsx`
- Create: `frontend/app/accounts/[id]/edit/page.tsx`
- Create: `frontend/components/accounts/account-form.tsx`

- [ ] **Step 1: Create the shared form (wrapped in `EditPageChrome`)**

`frontend/components/accounts/account-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EditPageChrome } from "@/components/layout/edit-page-chrome";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { archiveAccount, createAccount, restoreAccount, updateAccount } from "@/lib/banking";
import type { Account, AccountType } from "@/lib/types";

// Build YYYY-MM-DD from local calendar parts (per CLAUDE.md gotcha — never use toISOString().slice(0,10)).
function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AccountForm({
  initial,
  accountTypes,
}: {
  initial?: Account;
  accountTypes: AccountType[];
}) {
  const router = useRouter();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [bank, setBank] = useState(initial?.bank ?? "");
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? "");
  const [accountTypeId, setAccountTypeId] = useState(initial?.accountTypeId ?? accountTypes[0]?.id ?? "");
  const [openingBalance, setOpeningBalance] = useState(initial?.openingBalance ?? "0.00");
  const [openingDate, setOpeningDate] = useState(initial?.openingDate?.slice(0, 10) ?? localIsoDate(new Date()));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        bank: bank.trim(),
        accountNumber: accountNumber.trim() || undefined,
        accountTypeId,
        openingBalance: Number(openingBalance),
        openingDate,
        notes: notes.trim() || undefined,
      };
      if (isEdit) await updateAccount(initial!.id, payload);
      else await createAccount(payload);
      router.push(isEdit ? `/accounts/${initial!.id}` : "/accounts");
    } finally {
      setSaving(false);
    }
  }

  async function onArchive() {
    if (!initial) return;
    if (initial.isActive) await archiveAccount(initial.id);
    else await restoreAccount(initial.id);
    router.refresh();
  }

  const archiveBtn = initial ? (
    <Button type="button" variant="outline" onClick={onArchive}>
      {initial.isActive ? "Archive" : "Restore"}
    </Button>
  ) : null;

  return (
    <EditPageChrome
      title={isEdit ? "Edit Account" : "New Account"}
      backHref={isEdit ? `/accounts/${initial!.id}` : "/accounts"}
      formId="account-form"
      saving={saving}
      rightActions={archiveBtn ?? undefined}
    >
      <Card className="p-6">
        <form id="account-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </div>
          <div>
            <Label>Bank</Label>
            <Input value={bank} onChange={(e) => setBank(e.target.value)} required maxLength={120} />
          </div>
          <div>
            <Label>Account number (optional)</Label>
            <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label>Account type</Label>
            <Select value={accountTypeId} onValueChange={setAccountTypeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {accountTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Opening balance (AUD)</Label>
            <Input
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Opening date</Label>
            <Input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} required />
          </div>
          <div className="md:col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} />
          </div>
        </form>
      </Card>
    </EditPageChrome>
  );
}
```

- [ ] **Step 2: Create the new-account route**

`frontend/app/accounts/new/page.tsx`:

```tsx
import { AccountForm } from "@/components/accounts/account-form";
import { listAccountTypes } from "@/lib/banking";

export default async function Page() {
  const types = await listAccountTypes();
  return <AccountForm accountTypes={types.filter((t) => t.isActive)} />;
}
```

- [ ] **Step 3: Create the edit route**

`frontend/app/accounts/[id]/edit/page.tsx`:

```tsx
import { AccountForm } from "@/components/accounts/account-form";
import { getAccount, listAccountTypes } from "@/lib/banking";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [account, types] = await Promise.all([getAccount(id), listAccountTypes()]);
  return <AccountForm initial={account} accountTypes={types.filter((t) => t.isActive || t.id === account.accountTypeId)} />;
}
```

- [ ] **Step 4: Verify in browser**

Open `http://localhost:3000/accounts/new`, fill the form, save. Confirm redirect to `/accounts`, new account appears.
Open `/accounts/<id>/edit`, change a field, save. Confirm change persists. Click Archive — page refreshes with Status: Archived.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/accounts/new frontend/app/accounts/\[id\] frontend/components/accounts/account-form.tsx
git commit -m "feat(banking): account create + edit forms"
```

---

## Task 12: Frontend — Account detail page (header + per-account transactions)

**Files:**
- Create: `frontend/app/accounts/[id]/page.tsx`
- Create: `frontend/components/accounts/account-header-card.tsx`

- [ ] **Step 1: Create the header card**

`frontend/components/accounts/account-header-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import type { Account } from "@/lib/types";

function fmt(amount: string | number | undefined) {
  return `$${Number(amount ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AccountHeaderCard({ account, rightAction }: { account: Account; rightAction?: React.ReactNode }) {
  return (
    <Card className="mb-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400">{account.accountType?.name ?? ""}</div>
          <h1 className="text-2xl font-semibold text-slate-900">{account.name}</h1>
          <div className="mt-1 text-sm text-slate-600">
            {account.bank}{account.accountNumber ? ` · ${account.accountNumber}` : ""}
            {!account.isActive ? <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">Archived</span> : null}
          </div>
          {account.latestImport ? (
            <div className="mt-2 text-xs text-slate-500">
              Last import:{" "}
              <Link href={`/settings/import-logs/${account.latestImport.id}`} className="underline hover:text-slate-700">
                {new Date(account.latestImport.importedAt).toLocaleString("en-AU")}
                {" — "}
                {account.latestImport.rowsImported} rows
              </Link>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-slate-400">Current balance</div>
            <div className="font-mono text-2xl font-semibold tabular-nums text-slate-900">
              {fmt(account.currentBalance)}
            </div>
            <div className="text-xs text-slate-500">
              Opening {fmt(account.openingBalance)} on {account.openingDate?.slice(0, 10)}
            </div>
          </div>
          {rightAction}
          <Button asChild variant="outline">
            <Link href={`/accounts/${account.id}/edit`}>
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Create the detail page (transactions table comes from Task 13's component)**

`frontend/app/accounts/[id]/page.tsx`:

```tsx
import { AccountHeaderCard } from "@/components/accounts/account-header-card";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { ImportCsvButton } from "@/components/transaction-imports/import-csv-button";
import { getAccount, listAccounts } from "@/lib/banking";
import { PageShell } from "@/components/layout/page-shell";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [account, allAccounts] = await Promise.all([getAccount(id), listAccounts(true)]);
  return (
    <PageShell title="">
      <AccountHeaderCard
        account={account}
        rightAction={<ImportCsvButton accountId={account.id} />}
      />
      <TransactionsTable
        mode="account"
        fixedAccountId={account.id}
        accounts={allAccounts}
        searchParams={sp}
      />
    </PageShell>
  );
}
```

- [ ] **Step 3: Build will fail until Tasks 13 and 16 are done. That's expected — proceed to Task 13 before testing browser-side.**

- [ ] **Step 4: Commit (the imports point to files that will exist after Task 13/16; this is intentional)**

```bash
git add frontend/app/accounts/\[id\]/page.tsx frontend/components/accounts/account-header-card.tsx
git commit -m "feat(banking): account detail page + header card"
```

---

## Task 13: Frontend — Transactions table component (server-side)

**Files:**
- Create: `frontend/components/transactions/transactions-table.tsx`
- Create: `frontend/components/transactions/transaction-amount-cell.tsx`

- [ ] **Step 1: Amount cell**

`frontend/components/transactions/transaction-amount-cell.tsx`:

```tsx
import { cn } from "@/lib/utils";

export function TransactionAmountCell({ amount }: { amount: string | number }) {
  const n = Number(amount);
  const credit = n >= 0;
  return (
    <span className={cn("font-mono tabular-nums", credit ? "text-green-700" : "text-red-700")}>
      {credit ? "+" : "−"}${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}
```

- [ ] **Step 2: Transactions table (server-paginated, URL-driven state)**

`frontend/components/transactions/transactions-table.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/data/pagination";
import { cn } from "@/lib/utils";
import { TransactionAmountCell } from "./transaction-amount-cell";
import { listTransactions } from "@/lib/banking";
import type { Account, Transaction } from "@/lib/types";

type SortKey = "date" | "amount" | "description" | "runningBalance";

export function TransactionsTable({
  mode,
  fixedAccountId,
  accounts,
  searchParams,
}: {
  mode: "account" | "global";
  fixedAccountId?: string;
  accounts: Account[];
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearch = useSearchParams();

  // URL-driven state — parse on every render.
  const sortBy = (searchParams.sortBy as SortKey) || "date";
  const sortDir = (searchParams.sortDir as "asc" | "desc") || "desc";
  const page = Number(searchParams.page ?? 1);
  const dateFrom = (searchParams.dateFrom as string) || "";
  const dateTo = (searchParams.dateTo as string) || "";
  const selectedAccountIds: string[] = mode === "account"
    ? [fixedAccountId!]
    : ((searchParams.accountIds as string)?.split(",").filter(Boolean) ?? []);

  const PAGE_SIZE = 200;

  const [rows, setRows] = useState<Transaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);

  // Local input mirrors for the filter panel before user clicks Apply.
  const [tempDateFrom, setTempDateFrom] = useState(dateFrom);
  const [tempDateTo, setTempDateTo] = useState(dateTo);
  const [tempAccountIds, setTempAccountIds] = useState<string[]>(selectedAccountIds);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listTransactions({
      accountIds: selectedAccountIds.length ? selectedAccountIds : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        setRows(res.items);
        setTotalCount(res.totalCount);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [sortBy, sortDir, page, dateFrom, dateTo, selectedAccountIds.join(",")]);

  function patchQuery(next: Record<string, string | null>) {
    const params = new URLSearchParams(urlSearch);
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleSort(key: SortKey) {
    if (sortBy !== key) patchQuery({ sortBy: key, sortDir: "asc", page: "1" });
    else patchQuery({ sortDir: sortDir === "asc" ? "desc" : "asc", page: "1" });
  }

  function applyFilters() {
    patchQuery({
      dateFrom: tempDateFrom || null,
      dateTo: tempDateTo || null,
      accountIds: mode === "global"
        ? (tempAccountIds.length ? tempAccountIds.join(",") : null)
        : null,
      page: "1",
    });
    setFilterOpen(false);
  }

  function clearFilters() {
    setTempDateFrom("");
    setTempDateTo("");
    setTempAccountIds([]);
    patchQuery({ dateFrom: null, dateTo: null, accountIds: null, page: "1" });
  }

  const cols: Array<{ key: SortKey | "account"; label: string; align?: "right" | "center"; sortable: boolean; width: string }> = [
    { key: "date", label: "Date", sortable: true, width: "110px" },
    { key: "description", label: "Description", sortable: true, width: "2fr" },
    { key: "amount", label: "Amount", align: "right", sortable: true, width: "1fr" },
    { key: "runningBalance", label: "Balance", align: "right", sortable: true, width: "1fr" },
  ];
  if (mode === "global") cols.push({ key: "account", label: "Account", sortable: false, width: "1fr" });

  const gridTemplate = cols.map((c) => c.width).join(" ");
  const activeFilters = (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (mode === "global" && selectedAccountIds.length ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          {loading ? "Loading…" : `${totalCount.toLocaleString("en-AU")} transaction${totalCount === 1 ? "" : "s"}`}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setFilterOpen((o) => !o)}
          className={cn(filterOpen && "border-indigo-300 bg-indigo-50/40")}
        >
          <Filter className="h-4 w-4" /> Filter
          {activeFilters > 0 && (
            <span className="ml-1 grid h-4 min-w-[1rem] place-items-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
              {activeFilters}
            </span>
          )}
        </Button>
      </div>

      {filterOpen && (
        <Card className="p-4" style={{ background: "rgb(212 215 225 / 79%)" }}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <Label>Date from</Label>
              <Input type="date" value={tempDateFrom} onChange={(e) => setTempDateFrom(e.target.value)} />
            </div>
            <div>
              <Label>Date to</Label>
              <Input type="date" value={tempDateTo} onChange={(e) => setTempDateTo(e.target.value)} />
            </div>
            {mode === "global" && (
              <div>
                <Label>Accounts</Label>
                <div className="flex flex-wrap gap-1.5">
                  {accounts.map((a) => {
                    const on = tempAccountIds.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() =>
                          setTempAccountIds((curr) =>
                            curr.includes(a.id) ? curr.filter((x) => x !== a.id) : [...curr, a.id],
                          )
                        }
                        className={cn(
                          "rounded-[0.3rem] border px-2 py-1 text-xs",
                          on ? "border-indigo-400 bg-indigo-100 text-indigo-900" : "border-slate-300 bg-white text-slate-600",
                        )}
                      >
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={clearFilters}>Clear</Button>
            <Button type="button" onClick={applyFilters}>Apply</Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div
          className="grid items-center gap-x-4 border-b border-slate-100 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-400"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {cols.map((c) => {
            const isActive = sortBy === c.key;
            const justify = c.align === "right" ? "justify-end" : c.align === "center" ? "justify-center" : "justify-start";
            return (
              <div
                key={c.key}
                className={cn("flex items-center gap-1", justify, c.sortable && "cursor-pointer select-none hover:text-slate-600")}
                onClick={c.sortable ? () => toggleSort(c.key as SortKey) : undefined}
              >
                <span>{c.label}</span>
                {c.sortable ? (
                  isActive ? (
                    sortDir === "asc" ? <ChevronUp className="h-3 w-3 text-slate-700" /> : <ChevronDown className="h-3 w-3 text-slate-700" />
                  ) : (
                    <ChevronsUpDown className="h-3 w-3 text-slate-300" />
                  )
                ) : null}
              </div>
            );
          })}
        </div>
        <ul className="divide-y divide-slate-100">
          {!loading && rows.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-slate-400">No transactions for this filter.</li>
          )}
          {rows.map((t) => {
            const highlight = searchParams.highlight === t.id;
            return (
              <li key={t.id} className={cn("transition-colors", highlight && "bg-amber-100/80")}>
                <div className="grid items-center gap-x-4 px-5 py-3 text-sm" style={{ gridTemplateColumns: gridTemplate }}>
                  <div className="text-slate-700">{t.date.slice(0, 10)}</div>
                  <div className="min-w-0 truncate text-slate-700">{t.description}</div>
                  <div className="text-right"><TransactionAmountCell amount={t.amount} /></div>
                  <div className="text-right font-mono tabular-nums text-slate-500">
                    {t.runningBalance != null
                      ? `$${Number(t.runningBalance).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "—"}
                  </div>
                  {mode === "global" && (
                    <div className="text-slate-500">
                      <Link href={`/accounts/${t.accountId}`} className="hover:underline">{t.account?.name}</Link>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <Pagination
          page={page - 1 /* Pagination is 0-indexed */}
          pageSize={PAGE_SIZE}
          total={totalCount}
          onChange={(p) => patchQuery({ page: String(p + 1) })}
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/transactions
git commit -m "feat(banking): transactions table with server-side filter/sort/pagination"
```

---

## Task 14: Frontend — Global transactions page

**Files:**
- Replace: `frontend/app/transactions/page.tsx`

- [ ] **Step 1: Server component**

```tsx
import { PageShell } from "@/components/layout/page-shell";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { listAccounts } from "@/lib/banking";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const accounts = await listAccounts(true);
  return (
    <PageShell title="Transactions">
      <TransactionsTable mode="global" accounts={accounts} searchParams={sp} />
    </PageShell>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/transactions/page.tsx
git commit -m "feat(banking): global transactions page"
```

---

## Task 15: Frontend — Import CSV button + dialog (steps 1-3)

**Files:**
- Create: `frontend/components/transaction-imports/import-csv-button.tsx`
- Create: `frontend/components/transaction-imports/import-csv-dialog.tsx`
- Create: `frontend/components/transaction-imports/column-mapping-step.tsx`

- [ ] **Step 1: Button**

`frontend/components/transaction-imports/import-csv-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { ImportCsvDialog } from "./import-csv-dialog";

export function ImportCsvButton({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Import CSV
      </Button>
      {open && <ImportCsvDialog accountId={accountId} onClose={() => setOpen(false)} />}
    </>
  );
}
```

- [ ] **Step 2: Column-mapping step**

`frontend/components/transaction-imports/column-mapping-step.tsx`:

```tsx
"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { COLUMN_ROLES, DATE_FORMATS, type ColumnMapping, type ColumnRole, type DateFormat } from "@/lib/types";

// Validates the Style-A-or-B rule client-side so the user gets immediate feedback.
export function validateMapping(m: ColumnMapping): string | null {
  const counts: Record<ColumnRole, number> = { date: 0, description: 0, amount: 0, debit: 0, credit: 0, balance: 0, ignore: 0 };
  for (const r of m.columns) counts[r]++;
  if (counts.date !== 1) return "Pick exactly one Date column.";
  if (counts.description < 1) return "Pick at least one Description column.";
  if (counts.balance > 1) return "Only one Balance column is allowed.";
  const styleA = counts.amount === 1 && counts.debit === 0 && counts.credit === 0;
  const styleB = counts.amount === 0 && counts.debit === 1 && counts.credit === 1;
  if (!styleA && !styleB) return "Either pick one Amount column, or one Debit + one Credit column.";
  return null;
}

export function ColumnMappingStep({
  previewRows,
  mapping,
  onChange,
  reasoning,
}: {
  previewRows: string[][];
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
  reasoning: string[];
}) {
  const ncols = mapping.columns.length;

  function setRole(idx: number, role: ColumnRole) {
    const next = { ...mapping, columns: mapping.columns.map((r, i) => (i === idx ? role : r)) };
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <Label>Date format</Label>
          <Select value={mapping.dateFormat} onValueChange={(v) => onChange({ ...mapping, dateFormat: v as DateFormat })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATE_FORMATS.map((d) => (<SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <input
            id="has-header"
            type="checkbox"
            checked={mapping.hasHeader}
            onChange={(e) => onChange({ ...mapping, hasHeader: e.target.checked })}
            className="h-4 w-4"
          />
          <Label htmlFor="has-header" className="mb-0">File has a header row</Label>
        </div>
      </div>

      <Card className="overflow-x-auto p-3">
        <table className="min-w-full text-xs">
          <thead>
            <tr>
              {Array.from({ length: ncols }).map((_, i) => (
                <th key={i} className="p-1.5 align-bottom">
                  <Select value={mapping.columns[i]} onValueChange={(v) => setRole(i, v as ColumnRole)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COLUMN_ROLES.map((r) => (<SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, ri) => (
              <tr key={ri} className="border-t border-slate-100">
                {Array.from({ length: ncols }).map((_, ci) => (
                  <td key={ci} className="p-1.5 align-top font-mono text-[11px] text-slate-700">
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {reasoning.length > 0 && (
        <div className="text-xs text-slate-500">
          <div className="font-medium">Auto-detected:</div>
          <ul className="list-disc pl-5">
            {reasoning.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Dialog**

`frontend/components/transaction-imports/import-csv-dialog.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, AlertTriangle, Loader2 } from "lucide-react";
import { sniffCsv, commitImport } from "@/lib/banking";
import type { ColumnMapping, ImportReport, SniffResponse } from "@/lib/types";
import { ColumnMappingStep, validateMapping } from "./column-mapping-step";
import { ImportReportPopup } from "./import-report-popup";

type Stage = "choose" | "confirm" | "importing" | "report";

export function ImportCsvDialog({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [sniff, setSniff] = useState<SniffResponse | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function onFileChosen(f: File) {
    setError(null);
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setError("Please choose a .csv file.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File exceeds the 10 MB limit.");
      return;
    }
    setFile(f);
    setStage("importing");
    try {
      const res = await sniffCsv(f, accountId);
      setSniff(res);
      setMapping(res.suggestedMapping.mapping);
      setStage("confirm");
    } catch (e) {
      setError((e as Error).message);
      setStage("choose");
    }
  }

  async function onCommit() {
    if (!file || !sniff || !mapping) return;
    const v = validateMapping(mapping);
    if (v) { setError(v); return; }
    setError(null);
    setStage("importing");
    try {
      const r = await commitImport(file, accountId, sniff.fileSha256, mapping);
      setReport(r);
      setStage("report");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setStage("confirm");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {stage === "choose" && "Import CSV"}
            {stage === "confirm" && "Confirm column mapping"}
            {stage === "importing" && "Importing…"}
            {stage === "report" && "Import complete"}
          </DialogTitle>
        </DialogHeader>

        {stage === "choose" && (
          <div className="space-y-3">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFileChosen(e.target.files[0])}
            />
            <Button type="button" onClick={() => fileInput.current?.click()}>
              <Upload className="h-4 w-4" /> Choose CSV file
            </Button>
            <div className="text-xs text-slate-500">Max 10 MB. Headerless CBA-style exports work out of the box.</div>
            {error && <div className="text-sm text-red-700">{error}</div>}
          </div>
        )}

        {stage === "confirm" && sniff && mapping && (
          <div className="space-y-3">
            {sniff.alreadyImportedAs && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                This exact file was already imported. Proceeding will only insert new rows.
              </div>
            )}
            <ColumnMappingStep
              previewRows={sniff.previewRows}
              mapping={mapping}
              onChange={setMapping}
              reasoning={sniff.suggestedMapping.reasoning}
            />
            {error && <div className="text-sm text-red-700">{error}</div>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="button" onClick={onCommit}>Import</Button>
            </DialogFooter>
          </div>
        )}

        {stage === "importing" && (
          <div className="flex items-center justify-center py-10 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2">Processing CSV…</span>
          </div>
        )}

        {stage === "report" && report && (
          <ImportReportPopup data={report} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Commit (won't render until Task 16 supplies ImportReportPopup)**

```bash
git add frontend/components/transaction-imports/import-csv-button.tsx frontend/components/transaction-imports/import-csv-dialog.tsx frontend/components/transaction-imports/column-mapping-step.tsx
git commit -m "feat(banking): import CSV dialog (steps 1-3) + column mapper"
```

---

## Task 16: Frontend — Import report popup (shared component)

**Files:**
- Create: `frontend/components/transaction-imports/import-report-popup.tsx`

- [ ] **Step 1: The shared component**

`frontend/components/transaction-imports/import-report-popup.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type { ImportReport } from "@/lib/types";

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "err" }) {
  const palette =
    tone === "warn" ? "bg-amber-50 text-amber-900"
    : tone === "err" ? "bg-red-50 text-red-900"
    : tone === "ok" ? "bg-emerald-50 text-emerald-900"
    : "bg-slate-50 text-slate-900";
  return (
    <Card className={`p-4 ${palette}`}>
      <div className="text-[11px] font-medium uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString("en-AU")}</div>
    </Card>
  );
}

function Section({
  title, count, defaultOpen, children,
}: { title: string; count: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
        <span className="flex items-center gap-1">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {title} <span className="text-slate-400">({count.toLocaleString("en-AU")})</span>
        </span>
      </button>
      {open && <div className="border-t border-slate-100">{children}</div>}
    </Card>
  );
}

function fmt(amount: string | number) {
  const n = Number(amount);
  return `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ImportReportPopup({ data, onClose }: { data: ImportReport; onClose?: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium text-slate-700">{data.accountName}</div>
        <div className="text-xs text-slate-500">
          {data.filename} · {new Date(data.importedAt).toLocaleString("en-AU")}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total" value={data.counts.total} />
        <StatCard label="Imported" value={data.counts.imported} tone="ok" />
        <StatCard label="Duplicates" value={data.counts.duplicates} tone={data.counts.duplicates ? "warn" : undefined} />
        <StatCard label="Failed" value={data.counts.failed} tone={data.counts.failed ? "err" : undefined} />
      </div>

      {data.warnings.length > 0 && (
        <Card className="bg-amber-50 p-3">
          {data.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4" /> {w}
            </div>
          ))}
        </Card>
      )}

      <Section title="Imported" count={data.imported.length} defaultOpen={false}>
        <ul className="divide-y divide-slate-100 text-xs">
          {data.imported.map((r, i) => (
            <li key={i} className="grid grid-cols-[110px_1fr_110px] gap-3 px-4 py-2">
              <span className="text-slate-600">{r.date}</span>
              <span className="truncate text-slate-700">{r.description}</span>
              <span className="text-right font-mono tabular-nums">{fmt(r.amount)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Duplicates (skipped)" count={data.duplicates.length} defaultOpen={data.duplicates.length > 0}>
        <ul className="divide-y divide-slate-100 text-xs">
          {data.duplicates.map((r, i) => (
            <li key={i} className="grid grid-cols-[110px_1fr_110px_auto] gap-3 px-4 py-2">
              <span className="text-slate-600">{r.date}</span>
              <span className="truncate text-slate-700">{r.description}</span>
              <span className="text-right font-mono tabular-nums">{fmt(r.amount)}</span>
              <Link
                href={`/accounts/${data.accountId}?highlight=${r.existingTransactionId}`}
                className="text-xs text-indigo-600 hover:underline"
              >
                view existing
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Failed" count={data.failed.length} defaultOpen={data.failed.length > 0}>
        <ul className="divide-y divide-slate-100 text-xs">
          {data.failed.map((r, i) => (
            <li key={i} className="grid grid-cols-[60px_1fr] gap-3 px-4 py-2">
              <span className="text-slate-500">#{r.rowIndex + 1}</span>
              <div>
                <div className="text-red-700">{r.reason}</div>
                <div className="mt-0.5 font-mono text-slate-500">{r.raw.join(" , ")}</div>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {onClose && (
        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>Close</Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Restart frontend and verify the whole CSV-import path in a browser**

```bash
docker compose restart frontend
sleep 8
```

In a browser:
1. Open `http://localhost:3000/accounts`.
2. Click into "CBA Smart Access" — confirm the header card shows, transactions table renders empty.
3. Click **Import CSV** → choose `temp/1.csv` → confirm the mapping modal pre-selects `Date / Amount / Description / Balance` → click **Import**.
4. Report popup shows `Total 13, Imported 13, Duplicates 0, Failed 0`.
5. Close the dialog — transactions table now shows 13 rows, latest date at top.
6. Repeat with `temp/2.csv`: imports 30, duplicates 0 (different rows). Repeat with `temp/3.csv`: it overlaps Feb–Mar with `2.csv`, so duplicates should be ~9, imported ~13. **The popup must list each duplicate with a "view existing" link.**

- [ ] **Step 3: Commit**

```bash
git add frontend/components/transaction-imports/import-report-popup.tsx
git commit -m "feat(banking): import report popup (shared with import-logs detail page)"
```

---

## Task 17: Frontend — Settings → Account Types page

**Files:**
- Create: `frontend/app/settings/account-types/page.tsx`
- Create: `frontend/components/settings/account-types-manager.tsx`
- Modify: `frontend/components/settings/settings-nav.tsx`

- [ ] **Step 1: Inspect existing settings nav**

```bash
cat frontend/components/settings/settings-nav.tsx
```

Note the array of items. The Account Types entry needs to be added to the same list — mimic the existing entries' shape exactly.

- [ ] **Step 2: Manager component**

`frontend/components/settings/account-types-manager.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import {
  createAccountType,
  deleteAccountType,
  updateAccountType,
} from "@/lib/banking";
import type { AccountType } from "@/lib/types";

export function AccountTypesManager({ initial }: { initial: AccountType[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");

  async function onAdd() {
    if (!newName.trim()) return;
    await createAccountType({ name: newName.trim() });
    setNewName("");
    router.refresh();
  }

  async function onToggle(t: AccountType) {
    await updateAccountType(t.id, { isActive: !t.isActive });
    router.refresh();
  }

  async function onDelete(t: AccountType) {
    try {
      await deleteAccountType(t.id);
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New account type, e.g. Brokerage"
            maxLength={60}
          />
          <Button type="button" onClick={onAdd}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </Card>

      <Card>
        <ul className="divide-y divide-slate-100">
          {initial.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="font-medium text-slate-900">{t.name}</span>
                <Badge tone={t.isActive ? "completed" : "cancelled"}>{t.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onToggle(t)}>
                  {t.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onDelete(t)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Page**

`frontend/app/settings/account-types/page.tsx`:

```tsx
import { PageShell } from "@/components/layout/page-shell";
import { AccountTypesManager } from "@/components/settings/account-types-manager";
import { listAccountTypes } from "@/lib/banking";

export default async function Page() {
  const types = await listAccountTypes();
  return (
    <PageShell title="Account Types">
      <AccountTypesManager initial={types} />
    </PageShell>
  );
}
```

- [ ] **Step 4: Add the Settings sidebar entry**

Edit `frontend/components/settings/settings-nav.tsx` and add an entry for `/settings/account-types` with label "Account Types". Mirror the exact shape of the existing entries (don't invent a new field).

- [ ] **Step 5: Verify in browser**

Open `http://localhost:3000/settings/account-types`. Add a type, deactivate it, try to delete one in use (should show a toast/alert with the 409 message), then delete a new unused one.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/settings/account-types frontend/components/settings/account-types-manager.tsx frontend/components/settings/settings-nav.tsx
git commit -m "feat(banking): settings/account-types CRUD page"
```

---

## Task 18: Frontend — Settings → Import Logs

**Files:**
- Create: `frontend/app/settings/import-logs/page.tsx`
- Create: `frontend/app/settings/import-logs/[id]/page.tsx`
- Create: `frontend/components/settings/import-logs-list.tsx`
- Modify: `frontend/components/settings/settings-nav.tsx`

- [ ] **Step 1: List component**

`frontend/components/settings/import-logs-list.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import {
  FilteredList,
  selectMatches,
  type FilterFieldDef,
} from "@/components/data/filtered-list";
import type { Column } from "@/components/data/list-table";
import type { Account, ImportLogSummary } from "@/lib/types";

const columns: Column<ImportLogSummary>[] = [
  {
    key: "importedAt",
    label: "Imported",
    render: (r) => <span className="text-slate-700">{new Date(r.importedAt).toLocaleString("en-AU")}</span>,
    width: "180px",
    sortValue: (r) => new Date(r.importedAt),
  },
  {
    key: "account",
    label: "Account",
    render: (r) => <span className="font-medium text-slate-900">{r.account.name}</span>,
    width: "1fr",
    sortValue: (r) => r.account.name,
  },
  {
    key: "filename",
    label: "File",
    render: (r) => <span className="font-mono text-xs text-slate-600">{r.filename}</span>,
    width: "1.5fr",
    sortValue: (r) => r.filename,
  },
  { key: "rowsTotal", label: "Total", align: "right", render: (r) => <span className="tabular-nums">{r.rowsTotal}</span>, width: "70px", sortValue: (r) => r.rowsTotal },
  { key: "rowsImported", label: "Imported", align: "right", render: (r) => <span className="tabular-nums text-emerald-700">{r.rowsImported}</span>, width: "80px", sortValue: (r) => r.rowsImported },
  { key: "rowsSkippedDup", label: "Dupes", align: "right", render: (r) => <span className="tabular-nums text-amber-700">{r.rowsSkippedDup}</span>, width: "70px", sortValue: (r) => r.rowsSkippedDup },
  { key: "rowsFailed", label: "Failed", align: "right", render: (r) => <span className="tabular-nums text-red-700">{r.rowsFailed}</span>, width: "70px", sortValue: (r) => r.rowsFailed },
];

export function ImportLogsList({ initial, accounts }: { initial: ImportLogSummary[]; accounts: Account[] }) {
  const filterFields: FilterFieldDef[] = useMemo(
    () => [
      {
        key: "account",
        label: "Account",
        type: "select",
        options: accounts.map((a) => ({ value: a.id, label: a.name })),
      },
    ],
    [accounts],
  );
  return (
    <FilteredList<ImportLogSummary>
      title="Import Logs"
      rows={initial}
      columns={columns}
      rowHref={(r) => `/settings/import-logs/${r.id}`}
      emptyMessage="No imports yet."
      filterFields={filterFields}
      filterFn={(r, v) => selectMatches(r.accountId, v.account ?? "")}
      defaultSort={{ key: "importedAt", direction: "desc" }}
      tieBreakerKey="account"
    />
  );
}
```

- [ ] **Step 2: List page**

`frontend/app/settings/import-logs/page.tsx`:

```tsx
import { ImportLogsList } from "@/components/settings/import-logs-list";
import { listAccounts, listImportLogs } from "@/lib/banking";

export default async function Page() {
  const [logs, accounts] = await Promise.all([
    listImportLogs({ pageSize: 500 }),
    listAccounts(true),
  ]);
  return <ImportLogsList initial={logs.items} accounts={accounts} />;
}
```

- [ ] **Step 3: Detail page (re-uses `ImportReportPopup`)**

`frontend/app/settings/import-logs/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { ImportReportPopup } from "@/components/transaction-imports/import-report-popup";
import { getImportLog } from "@/lib/banking";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const log = await getImportLog(id);
  return (
    <PageShell
      title="Import Report"
      actions={
        <Link href="/settings/import-logs" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to logs
        </Link>
      }
    >
      <ImportReportPopup data={log.reportJson} />
    </PageShell>
  );
}
```

- [ ] **Step 4: Add the Settings sidebar entry for Import Logs**

In `frontend/components/settings/settings-nav.tsx`, add an entry for `/settings/import-logs` labelled "Import Logs", mirroring existing entries' shape exactly.

- [ ] **Step 5: Verify**

Open `/settings/import-logs`. Should list the three import attempts from Task 16's verification. Click into one — should render the same popup body, full content.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/settings/import-logs frontend/components/settings/import-logs-list.tsx frontend/components/settings/settings-nav.tsx
git commit -m "feat(banking): settings/import-logs list + detail pages"
```

---

## Task 19: Doc updates

**Files:**
- Modify: `DatabaseSchema.md`
- Modify: `Architecture.md`
- Modify: `modules_and_logic.md`
- Modify: `DesignSystem.md`

- [ ] **Step 1: `DatabaseSchema.md` — add a Banking section**

Append a new section documenting:
- `AccountType { id, name (unique), isActive }` — lookup, seeded with 6 rows.
- `Account { id, name, bank, accountNumber?, accountTypeId (Restrict), openingBalance Decimal(14,2), openingDate Date, notes?, isActive }` — soft-delete only.
- `Transaction { id, accountId (Cascade), date Date, amount Decimal(14,2) signed, description, runningBalance Decimal(14,2)?, categoryId? vendorCustomerId? notes? (Phase B forward-compat), importHash (sha256), importId? }` with `@@unique([accountId, importHash])`, `@@index([accountId, date])`, `@@index([date])`.
- `TransactionImport { id, accountId (Cascade), filename, fileSize, fileSha256, importedAt, mappingJson, rowsTotal, rowsImported, rowsSkippedDup, rowsFailed, reportJson }`.
- Why `Decimal(14, 2)` instead of `(12, 2)`: account balances accumulated over years can exceed the 10-digit-integer cap of `(12, 2)`.

- [ ] **Step 2: `Architecture.md` — list the new backend modules**

Add `accounts`, `account-types`, `transactions`, `transaction-imports`, `import-logs` to the backend module list. Note `papaparse` as a new dependency. Note the 10 MB upload cap on `/transaction-imports/sniff` and `/commit`.

- [ ] **Step 3: `modules_and_logic.md` — add three module sections**

`accounts`:
- Fields: name (required), bank (required), accountNumber (optional), accountTypeId (required, FK to AccountType), openingBalance (default 0), openingDate (defaults to today), notes (optional), isActive (default true).
- List page columns: Account · Bank · Type · Current balance · Transactions count · Status. Default sort: active first, then by name.
- Edit page rows: name + bank, accountNumber + accountTypeId, openingBalance + openingDate, notes (full-width). Archive/Restore via right-action button in `EditPageChrome`.
- Detail page (`/accounts/[id]`): `<AccountHeaderCard>` + `<TransactionsTable mode="account">` + Import CSV button.

`transactions`:
- The first list in the app with server-side filter/sort/pagination. URL-driven state.
- Columns (per-account mode): Date · Description · Amount · Balance. Global mode adds Account.
- Default sort: `date desc, id desc`. Page size 200 (overrides project default 100).
- Filter panel: account multi-select (global mode), date-from/date-to.

`import-logs`:
- Read-only. List under `/settings/import-logs`; detail at `/settings/import-logs/[id]`.
- The detail page uses the same `<ImportReportPopup>` as the post-import dialog — single source of truth for the report rendering.
- Records persist forever; no delete endpoint.

- [ ] **Step 4: `DesignSystem.md` — append banking exceptions**

- Transactions table uses **page size 200** (project default elsewhere is 100). Driven by the spec and by the realistic volume of bank-statement rows.
- Signed amount colours: positive → `text-green-700`, negative → `text-red-700`. Mono + tabular-nums.
- `<ImportReportPopup>` is a shared component rendered both inside the import dialog and on the persisted log page (`/settings/import-logs/[id]`). One canonical layout.

- [ ] **Step 5: Commit**

```bash
git add DatabaseSchema.md Architecture.md modules_and_logic.md DesignSystem.md
git commit -m "docs: banking Phase A — schema, architecture, modules, design system updates"
```

---

## Task 20: End-to-end manual verification

- [ ] **Step 1: Wipe and restart**

```bash
docker compose down -v
docker compose up -d
sleep 12
docker logs simplebooks-backend-1 --tail 50
```

Expected: backend boots clean, seed runs, 2 sample accounts + 6 account types in DB.

- [ ] **Step 2: Smoke test the full UI flow**

In a browser at `http://localhost:3000`:

1. Sidebar → Banking → Accounts. Confirm: list shows two seeded accounts.
2. Click **New account**. Create one named "Test Loan" with type "Loan", opening balance `-5000.00`, today's date. Save. Confirm: redirected to `/accounts`, three accounts visible.
3. Click **Test Loan** → confirm header card shows `-$5,000.00` opening, transactions table empty.
4. Click **Edit** in the header → set `isActive` off via the **Archive** button → confirm "Archived" badge appears.
5. Back to `/accounts` → confirm filter dropdown shows Active + Archived; default sort keeps active first.
6. Click "CBA Smart Access" → **Import CSV** → choose `temp/1.csv`. Mapping modal pre-selects `Date / Amount / Description / Balance`. Click Import.
7. Report popup: Total 13, Imported 13, Duplicates 0, Failed 0. Close.
8. Confirm transactions table shows 13 rows, newest at top (`09/05/2026` row 1). Click "Amount" column header → sort flips. Click "Date" → sort restored.
9. Import `temp/2.csv` → expects Imported 34, Duplicates 0.
10. Import `temp/3.csv` → expects Imported 9, Duplicates 13 (the Feb–Mar 2026 rows overlap with `2.csv`). Each duplicate row shows a "view existing" link.
11. Click one "view existing" link → lands on `/accounts/<id>?highlight=<txnId>` with that row briefly highlighted amber.
12. Top nav → **Transactions** (global) → confirm all imported rows visible across both accounts, account column populated.
13. Apply date filter `dateFrom=2026-04-01 dateTo=2026-04-30` → confirm only April rows. Clear filter.
14. Sidebar → Settings → **Import Logs**. Confirm 3 rows. Click newest → renders full report with imported/duplicates/failed sections, same shape as the original popup.
15. Sidebar → Settings → **Account Types**. Add "Investment", deactivate it, re-activate, delete it (should succeed, no accounts use it). Try to delete "Everyday" — expect alert with 409 message.

- [ ] **Step 3: Save screenshots of the three key views (per CLAUDE.md "Screenshots go in screenshots/")**

Use the Playwright MCP or browser dev tools to capture:
- `screenshots/banking-accounts-list.png`
- `screenshots/banking-account-detail-with-transactions.png`
- `screenshots/banking-import-report-popup.png`
- `screenshots/banking-import-logs-detail.png`

- [ ] **Step 4: Final commit if any verification turned up issues that were fixed**

```bash
git status
# If clean:
echo "Banking Phase A complete."
# Otherwise commit any cleanups:
git add -A
git commit -m "fix(banking): polish from E2E verification"
```

---

## Self-Review (after writing this plan)

**Spec coverage check** against `2026-05-21-banking-phase-a-design.md`:
- §1 Decisions: AccountType lookup → Task 2 ✓ · Running balance store + warn → Task 7 ✓ · importHash dedup → Tasks 1+7 ✓ · /accounts/[id] + /transactions → Tasks 12+14 ✓ · Sniff→confirm→commit → Tasks 6+7+15 ✓ · Soft-delete → Tasks 1+3+11 ✓
- §3 Data model: All 4 models + indexes → Task 1 ✓
- §4 Backend modules: All 4 + accounts + account-types → Tasks 2-8 ✓ · Endpoints → Tasks 3,4,7,8 ✓ · 10 MB cap → Task 7 ✓
- §5 Parser/sniffer: pure functions + tests → Tasks 5+6 ✓
- §6 Import flow + report shape: sniff→commit + warnings + duplicates report → Task 7 ✓
- §7 Frontend routes/components: accounts list/new/edit/detail → Tasks 10-12 ✓ · TransactionsTable → Task 13 ✓ · /transactions → Task 14 ✓ · import dialog → Task 15 ✓ · ImportReportPopup shared → Task 16 ✓ · /settings/account-types → Task 17 ✓ · /settings/import-logs → Task 18 ✓
- §8 Seed: 6 account types + 2 sample accounts → Task 1 ✓
- §9 Doc updates: All four files → Task 19 ✓
- §10 Implementation order: matches plan ordering ✓

**Placeholder scan:** None — every step has concrete code or commands.

**Type consistency check:** `ColumnMapping`, `ParsedRow`, `ImportReport`, `MappingSuggestion` defined once in `backend/src/transaction-imports/types.ts` (Task 5) and mirrored once in `frontend/lib/types.ts` (Task 9). Hash function signature `rowImportHash(date, amount, description, runningBalance)` defined in Task 7's `hash.ts` and called the same way in Task 7's service. `normaliseDesc` exported from `csv-parser.service.ts` (Task 5) and re-imported by `hash.ts` (Task 7). `parseCsv`, `sniffCsv` named consistently. ✓

**Scope check:** Phase A only — Phase B/C/D explicitly out of scope per spec §11. ✓

---

**Plan complete.** Execute via subagent-driven-development (recommended) or executing-plans.
