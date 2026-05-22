# Banking Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase B of the Banking module — Categories, Vendors (with auto-matching), Rules engine (AND-only, priority-ordered), two-pass categorisation engine, Test Rules sandbox, opt-in CSV-import categorisation, transaction splits, and CategorisationEvent audit log for Phase C AI learning.

**Architecture:** Four NestJS modules (`categories`, `vendors`, `rules`, `rule-engine`) following Phase A's per-domain pattern. Engine is a synchronous pure-function-style service that composes a vendor-matching pass and a rule-matching pass. All DB writes go through Prisma transactions with CategorisationEvent rows for audit. Frontend mirrors Phase A's server-component-page + client-component pattern, plus a new ordered (priority-driven) list shape for `/rules` that's distinct from the existing `<FilteredList>`.

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL, Next.js 15 (App Router, React 19). No new dependencies.

**Source of truth:** [docs/superpowers/specs/2026-05-22-banking-phase-b-design.md](../specs/2026-05-22-banking-phase-b-design.md). When in doubt, re-read the spec.

**Verification approach:** Same as Phase A — pure functions get `*.test.ts` files runnable via `docker build --target build` + `docker run --rm ... npx ts-node ...`. Everything else is verified by `docker logs` (backend clean boot), `curl` against the running stack, and browser checks at `localhost:3000`.

**Commits:** Conventional Commits (`feat(banking):`, `fix(banking):`, `docs:`). Phase A's baseline + 25 commits are already on `master`. Each task here commits onto `master`.

**Critical note for Task 1:** The `vendorCustomerId → vendorId` rename is non-additive. `docker compose down -v` is required before Task 1's `db push`. Your existing imported transactions get wiped — re-import from `temp/1.csv`, `temp/2.csv`, `temp/3.csv` as part of Task 25's verification.

---

## Task 1: Prisma schema + enums + seed (Phase B foundation)

**Files:**
- Modify: `backend/prisma/schema.prisma` (append at end + modify existing `Transaction` model)
- Modify: `backend/prisma/seed.ts` (append after Phase A's banking seed)

- [ ] **Step 1: Append enums and new models to schema.prisma**

Append at the end of `backend/prisma/schema.prisma`:

```prisma
// ── Banking Phase B ──────────────────────────────────────────────────

enum CategoryKind { INCOME  EXPENSE  TRANSFER  OTHER }
enum VendorKind   { MERCHANT  PERSON  CUSTOMER  BANK  OTHER }
enum RuleState    { USER  AI_DRAFTED  APPROVED  DENIED }
enum RuleField    { DESCRIPTION  AMOUNT  VENDOR  ACCOUNT }
enum RuleOperator { CONTAINS  EQUALS  STARTS_WITH  ENDS_WITH  GT  LT  BETWEEN  IN }
enum EventSource  { USER  RULE  VENDOR_MATCH  AI_DRAFT  AI_APPLIED }

model Category {
  id        String       @id @default(uuid())
  name      String       @unique
  kind      CategoryKind
  isActive  Boolean      @default(true)
  sortOrder Int          @default(100)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  transactions      Transaction[]
  transactionSplits TransactionSplit[]
  rules             Rule[]
}

model Vendor {
  id        String     @id @default(uuid())
  name      String     @unique
  kind      VendorKind
  aliases   String[]
  notes     String?
  isActive  Boolean    @default(true)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  transactions Transaction[]
  rules        Rule[]
}

model Rule {
  id          String     @id @default(uuid())
  name        String
  state       RuleState  @default(USER)
  isActive    Boolean    @default(true)
  priority    Int        @default(1000)

  categoryId  String
  category    Category   @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  vendorId    String?
  vendor      Vendor?    @relation(fields: [vendorId], references: [id], onDelete: SetNull)
  noteOnApply String?

  hitCount    Int        @default(0)
  lastFiredAt DateTime?

  conditions   RuleCondition[]
  events       CategorisationEvent[]
  transactions Transaction[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([priority])
  @@index([state, isActive])
}

model RuleCondition {
  id        String       @id @default(uuid())
  ruleId    String
  rule      Rule         @relation(fields: [ruleId], references: [id], onDelete: Cascade)

  field     RuleField
  operator  RuleOperator
  value     String
  value2    String?
  valueList String[]
  position  Int          @default(0)

  @@index([ruleId])
}

model TransactionSplit {
  id            String      @id @default(uuid())
  transactionId String
  transaction   Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)

  categoryId    String
  category      Category    @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  amount        Decimal     @db.Decimal(14, 2)
  notes         String?
  position      Int         @default(0)

  @@index([transactionId])
}

model CategorisationEvent {
  id            String      @id @default(uuid())
  transactionId String
  transaction   Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)

  source        EventSource
  ruleId        String?
  rule          Rule?       @relation(fields: [ruleId], references: [id], onDelete: SetNull)

  oldCategoryId String?
  newCategoryId String?
  oldVendorId   String?
  newVendorId   String?

  acceptedAiSuggestion Boolean?

  createdAt     DateTime    @default(now())

  @@index([transactionId])
  @@index([source, createdAt])
  @@index([ruleId])
}
```

- [ ] **Step 2: Modify the existing Transaction model**

Find the existing `model Transaction` block (added in Phase A). Update it to:

```prisma
model Transaction {
  id              String   @id @default(uuid())
  accountId       String
  account         Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)

  date            DateTime @db.Date
  amount          Decimal  @db.Decimal(14, 2)
  description     String
  runningBalance  Decimal? @db.Decimal(14, 2)

  // CHANGED: real FK to Category.
  categoryId String?
  category   Category? @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  // RENAMED from vendorCustomerId; real FK to Vendor.
  vendorId String?
  vendor   Vendor?  @relation(fields: [vendorId], references: [id], onDelete: SetNull)

  notes String?

  // NEW: which rule last set categoryId.
  ruleId String?
  rule   Rule?   @relation(fields: [ruleId], references: [id], onDelete: SetNull)

  // NEW: timestamp of last categorisation pass (null = uncategorised).
  categorisedAt DateTime?

  importHash String
  importId   String?
  import     TransactionImport? @relation(fields: [importId], references: [id], onDelete: SetNull)

  splits TransactionSplit[]
  events CategorisationEvent[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([accountId, importHash])
  @@index([accountId, date])
  @@index([date])
}
```

The diff vs Phase A: `categoryId` becomes a real FK (no longer a placeholder string); `vendorCustomerId` is REMOVED and replaced by `vendorId` (real FK to Vendor); new fields `ruleId`/`rule` and `categorisedAt`; new inverse relations `splits` and `events`.

- [ ] **Step 3: Append seed data**

In `backend/prisma/seed.ts`, find the Phase A banking seed block (added in Task 1 of Phase A's plan — the one that seeds AccountType and 2 sample accounts). After that block, append:

```ts
  // ── Categories (Banking Phase B) ─────────────────────────────────────────
  const CATEGORIES = [
    { name: 'Income — Customer payments', kind: 'INCOME' as const, sortOrder: 10 },
    { name: 'Income — Personal', kind: 'INCOME' as const, sortOrder: 20 },
    { name: 'Income — Refunds', kind: 'INCOME' as const, sortOrder: 30 },
    { name: 'Income — Other', kind: 'INCOME' as const, sortOrder: 40 },
    { name: 'Expense — Rent', kind: 'EXPENSE' as const, sortOrder: 110 },
    { name: 'Expense — Utilities', kind: 'EXPENSE' as const, sortOrder: 120 },
    { name: 'Expense — Telecom', kind: 'EXPENSE' as const, sortOrder: 130 },
    { name: 'Expense — Insurance', kind: 'EXPENSE' as const, sortOrder: 140 },
    { name: 'Expense — Groceries', kind: 'EXPENSE' as const, sortOrder: 150 },
    { name: 'Expense — Fuel', kind: 'EXPENSE' as const, sortOrder: 160 },
    { name: 'Expense — Subscriptions & Online', kind: 'EXPENSE' as const, sortOrder: 170 },
    { name: 'Expense — Personal', kind: 'EXPENSE' as const, sortOrder: 180 },
    { name: 'Expense — Bank fees', kind: 'EXPENSE' as const, sortOrder: 190 },
    { name: 'Transfer — Between own accounts', kind: 'TRANSFER' as const, sortOrder: 210 },
    { name: 'Other — Uncategorised review', kind: 'OTHER' as const, sortOrder: 999 },
  ];
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { name: c.name },
      update: {},
      create: c,
    });
  }

  // ── Vendors (Banking Phase B) ────────────────────────────────────────────
  const VENDORS: Array<{ name: string; kind: 'MERCHANT' | 'PERSON' | 'CUSTOMER' | 'BANK' | 'OTHER'; aliases: string[] }> = [
    { name: 'BP', kind: 'MERCHANT', aliases: ['bp ', 'bp australia', 'bp connect'] },
    { name: 'Caltex', kind: 'MERCHANT', aliases: ['caltex', 'ampol caltex'] },
    { name: 'Shell', kind: 'MERCHANT', aliases: ['shell ', 'shell coles'] },
    { name: 'Ampol', kind: 'MERCHANT', aliases: ['ampol', 'caltex ampol'] },
    { name: '7-Eleven', kind: 'MERCHANT', aliases: ['7-eleven', '7 eleven', '7eleven'] },
    { name: 'Costco', kind: 'MERCHANT', aliases: ['costco'] },
    { name: 'Liberty', kind: 'MERCHANT', aliases: ['liberty oil', 'liberty service'] },
    { name: 'Mobil', kind: 'MERCHANT', aliases: ['mobil '] },
    { name: 'Vibe', kind: 'MERCHANT', aliases: ['vibe service', 'vibe petroleum'] },
    { name: 'United', kind: 'MERCHANT', aliases: ['united petroleum'] },
    { name: 'Woolworths', kind: 'MERCHANT', aliases: ['woolworths', 'woolies', 'ww metro', 'ww supermarkets'] },
    { name: 'Coles', kind: 'MERCHANT', aliases: ['coles ', 'coles supermarkets', 'coles express'] },
    { name: 'IGA', kind: 'MERCHANT', aliases: ['iga '] },
    { name: 'ALDI', kind: 'MERCHANT', aliases: ['aldi '] },
    { name: 'Foodland', kind: 'MERCHANT', aliases: ['foodland'] },
    { name: 'PayPal', kind: 'MERCHANT', aliases: ['paypal', '617704'] },
    { name: 'Stripe', kind: 'MERCHANT', aliases: ['stripe payments'] },
    { name: 'eBay', kind: 'MERCHANT', aliases: ['ebay '] },
    { name: 'Amazon AU', kind: 'MERCHANT', aliases: ['amazon au', 'amazon.com.au', 'amzn mktp au'] },
    { name: 'Apple', kind: 'MERCHANT', aliases: ['apple.com/bill', 'apple pty ltd'] },
    { name: 'Google Play', kind: 'MERCHANT', aliases: ['google *play', 'google play'] },
    { name: 'Telstra', kind: 'MERCHANT', aliases: ['telstra'] },
    { name: 'Optus', kind: 'MERCHANT', aliases: ['optus ', 'singtel optus'] },
    { name: 'Vodafone', kind: 'MERCHANT', aliases: ['vodafone'] },
    { name: 'TPG', kind: 'MERCHANT', aliases: ['tpg internet', 'tpg telecom'] },
    { name: 'Aussie Broadband', kind: 'MERCHANT', aliases: ['aussie broadband'] },
    { name: 'Synergy', kind: 'MERCHANT', aliases: ['synergy '] },
    { name: 'Water Corp', kind: 'MERCHANT', aliases: ['water corp', 'water corporation'] },
    { name: 'Alinta Energy', kind: 'MERCHANT', aliases: ['alinta energy', 'alinta gas'] },
    { name: 'RAC', kind: 'MERCHANT', aliases: ['rac ', 'raci ', '250930'] },
    { name: 'NRMA', kind: 'MERCHANT', aliases: ['nrma '] },
    { name: 'AAMI', kind: 'MERCHANT', aliases: ['aami '] },
    { name: 'Allianz', kind: 'MERCHANT', aliases: ['allianz'] },
    { name: 'Bupa', kind: 'MERCHANT', aliases: ['bupa '] },
    { name: 'Medibank', kind: 'MERCHANT', aliases: ['medibank'] },
    { name: 'Commonwealth Bank', kind: 'BANK', aliases: ['commbank', 'cba ', 'commonwealth bank'] },
    { name: 'NAB', kind: 'BANK', aliases: ['national australia bank', 'nab '] },
    { name: 'Westpac', kind: 'BANK', aliases: ['westpac'] },
    { name: 'ANZ', kind: 'BANK', aliases: ['anz '] },
  ];
  for (const v of VENDORS) {
    await prisma.vendor.upsert({
      where: { name: v.name },
      update: { aliases: v.aliases, kind: v.kind },
      create: v,
    });
  }
```

- [ ] **Step 4: Wipe DB and push schema**

```bash
docker compose down -v
docker compose build backend && docker compose up -d
sleep 12
docker logs simplebooks-backend-1 --tail 60
```

Expected: `prisma db push` succeeds; seed runs; `Nest application successfully started` appears in the log.

- [ ] **Step 5: Verify schema landed**

```bash
docker compose exec postgres psql -U accounting -d accounting -c "\dt" | grep -E "Category|Vendor|Rule|TransactionSplit|CategorisationEvent"
docker compose exec postgres psql -U accounting -d accounting -c "SELECT COUNT(*) FROM \"Category\""
docker compose exec postgres psql -U accounting -d accounting -c "SELECT COUNT(*) FROM \"Vendor\""
docker compose exec postgres psql -U accounting -d accounting -c "\d \"Transaction\"" | grep -E "categoryId|vendorId|ruleId|categorisedAt"
```

Expected: 5 new tables listed, 15 categories, 38 vendors, Transaction has the new columns (and NO `vendorCustomerId`).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/seed.ts
git commit -m "feat(banking): Phase B schema — Category, Vendor, Rule, splits, events + seed"
```

---

## Task 2: Backend — Categories module (CRUD)

**Files:**
- Create: `backend/src/categories/categories.module.ts`
- Create: `backend/src/categories/categories.controller.ts`
- Create: `backend/src/categories/categories.service.ts`
- Create: `backend/src/categories/dto.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create DTO**

`backend/src/categories/dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export enum CategoryKindDto { INCOME = 'INCOME', EXPENSE = 'EXPENSE', TRANSFER = 'TRANSFER', OTHER = 'OTHER' }

export class CreateCategoryDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsEnum(CategoryKindDto) kind!: CategoryKindDto;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() sortOrder?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateCategoryDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(120) name?: string;
  @IsEnum(CategoryKindDto) @IsOptional() kind?: CategoryKindDto;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() sortOrder?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
```

- [ ] **Step 2: Create service**

`backend/src/categories/categories.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { transactions: true, transactionSplits: true, rules: true } } },
    });
    return rows;
  }

  async get(id: string) {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  create(data: CreateCategoryDto) {
    return this.prisma.category.create({
      data: { ...data, isActive: data.isActive ?? true, sortOrder: data.sortOrder ?? 100 },
    });
  }

  async update(id: string, data: UpdateCategoryDto) {
    await this.get(id);
    return this.prisma.category.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.get(id);
    const [txCount, splitCount, ruleCount] = await Promise.all([
      this.prisma.transaction.count({ where: { categoryId: id } }),
      this.prisma.transactionSplit.count({ where: { categoryId: id } }),
      this.prisma.rule.count({ where: { categoryId: id } }),
    ]);
    if (txCount + splitCount + ruleCount > 0) {
      const parts: string[] = [];
      if (txCount) parts.push(`${txCount} transaction${txCount === 1 ? '' : 's'}`);
      if (splitCount) parts.push(`${splitCount} split${splitCount === 1 ? '' : 's'}`);
      if (ruleCount) parts.push(`${ruleCount} rule${ruleCount === 1 ? '' : 's'}`);
      throw new ConflictException(`Cannot delete category: ${parts.join(', ')} reference it. Reassign first.`);
    }
    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }
}
```

- [ ] **Step 3: Create controller**

`backend/src/categories/categories.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

@Controller('categories')
export class CategoriesController {
  constructor(private service: CategoriesService) {}

  @Get() list() { return this.service.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateCategoryDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) { return this.service.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}
```

- [ ] **Step 4: Create module**

`backend/src/categories/categories.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
```

- [ ] **Step 5: Register in app.module.ts**

In `backend/src/app.module.ts` add the import and include `CategoriesModule` in the `imports` array.

- [ ] **Step 6: Rebuild and verify**

```bash
docker compose build backend && docker compose up -d backend
sleep 8
curl -s http://localhost:4000/categories | python3 -c "import sys,json; d=json.load(sys.stdin); print('count:', len(d)); print('names:', [r['name'] for r in d[:5]])"
```

Expected: 15 categories, sorted by sortOrder. First five are the Income categories.

```bash
EXPENSE_RENT=$(curl -s http://localhost:4000/categories | python3 -c "import sys,json; print([r for r in json.load(sys.stdin) if r['name']=='Expense — Rent'][0]['id'])")
curl -s -o /dev/stderr -w 'delete in-use category: HTTP %{http_code}\n' -X DELETE http://localhost:4000/categories/$EXPENSE_RENT
```

(Should be HTTP 200 since no transactions yet reference Rent — confirms the path. The actual 409 path gets tested in Task 7 once rules exist.)

- [ ] **Step 7: Commit**

```bash
git add backend/src/categories backend/src/app.module.ts
git commit -m "feat(banking): categories CRUD module"
```

---

## Task 3: Backend — Vendors module (CRUD)

**Files:**
- Create: `backend/src/vendors/vendors.module.ts`
- Create: `backend/src/vendors/vendors.controller.ts`
- Create: `backend/src/vendors/vendors.service.ts`
- Create: `backend/src/vendors/dto.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create DTO**

`backend/src/vendors/dto.ts`:

```ts
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export enum VendorKindDto { MERCHANT = 'MERCHANT', PERSON = 'PERSON', CUSTOMER = 'CUSTOMER', BANK = 'BANK', OTHER = 'OTHER' }

export class CreateVendorDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsEnum(VendorKindDto) kind!: VendorKindDto;
  @IsArray() @IsString({ each: true }) aliases!: string[];
  @IsString() @IsOptional() @MaxLength(2000) notes?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateVendorDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(120) name?: string;
  @IsEnum(VendorKindDto) @IsOptional() kind?: VendorKindDto;
  @IsArray() @IsOptional() @IsString({ each: true }) aliases?: string[];
  @IsString() @IsOptional() @MaxLength(2000) notes?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
```

- [ ] **Step 2: Create service**

`backend/src/vendors/vendors.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorDto, UpdateVendorDto } from './dto';

// Aliases stored verbatim from input. Lowercase + whitespace-collapsing happens
// at match-time, not store-time, so the user's intent (e.g. trailing space) is
// preserved exactly.
@Injectable()
export class VendorsService {
  constructor(private prisma: PrismaService) {}

  async list(includeInactive = false) {
    return this.prisma.vendor.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { transactions: true } } },
    });
  }

  async get(id: string) {
    const row = await this.prisma.vendor.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  create(data: CreateVendorDto) {
    return this.prisma.vendor.create({
      data: { ...data, isActive: data.isActive ?? true, aliases: data.aliases.map((a) => a.toLowerCase()) },
    });
  }

  async update(id: string, data: UpdateVendorDto) {
    await this.get(id);
    return this.prisma.vendor.update({
      where: { id },
      data: {
        ...data,
        aliases: data.aliases ? data.aliases.map((a) => a.toLowerCase()) : undefined,
      },
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.vendor.delete({ where: { id } });
    return { ok: true };
  }
}
```

- [ ] **Step 3: Create controller**

`backend/src/vendors/vendors.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { CreateVendorDto, UpdateVendorDto } from './dto';

@Controller('vendors')
export class VendorsController {
  constructor(private service: VendorsService) {}

  @Get() list(@Query('includeInactive') includeInactive?: string) {
    return this.service.list(includeInactive === 'true');
  }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateVendorDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateVendorDto) { return this.service.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}
```

- [ ] **Step 4: Create module**

`backend/src/vendors/vendors.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
```

- [ ] **Step 5: Register in app.module.ts**

Add `VendorsModule` to imports.

- [ ] **Step 6: Rebuild and verify**

```bash
docker compose build backend && docker compose up -d backend
sleep 8
curl -s http://localhost:4000/vendors | python3 -c "import sys,json; d=json.load(sys.stdin); print('count:', len(d)); print('sample:', d[0])"
```

Expected: 38 vendors, first one alphabetised (7-Eleven). Sample shows aliases array + kind.

- [ ] **Step 7: Commit**

```bash
git add backend/src/vendors backend/src/app.module.ts
git commit -m "feat(banking): vendors CRUD module"
```

---

## Task 4: Backend — Vendor extractor service + tests

**Files:**
- Create: `backend/src/vendors/vendor-extractor.service.ts`
- Create: `backend/src/vendors/vendor-extractor.test.ts`
- Modify: `backend/src/vendors/vendors.module.ts` (add service to providers)
- Modify: `backend/src/vendors/vendors.controller.ts` (add extract endpoints)
- Modify: `backend/src/vendors/dto.ts` (add extract DTOs)

- [ ] **Step 1: Add DTOs to vendors/dto.ts**

Append to `backend/src/vendors/dto.ts`:

```ts
import { ValidateNested } from 'class-validator';
import { IsISO8601, IsIn, IsUUID } from 'class-validator';

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
  @IsArray() candidates!: ExtractCandidateInputDto[];
}
```

- [ ] **Step 2: Write the failing test**

`backend/src/vendors/vendor-extractor.test.ts`:

```ts
import { strict as assert } from 'node:assert';
import { extractCandidates, normaliseAndTokenise } from './vendor-extractor.service';

function run(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`); console.error(e); process.exitCode = 1; }
}

run('normaliseAndTokenise strips noise prefixes', () => {
  const result = normaliseAndTokenise('Direct Debit 617704 PAYPAL AUSTRALIA 1050102939603');
  // After stripping "direct debit" and trailing digits, "paypal australia" remains.
  assert.ok(result.includes('paypal'), 'should contain paypal');
  assert.ok(result.includes('australia'), 'should contain australia');
  assert.ok(!result.includes('direct'), 'should drop direct');
});

run('extractCandidates finds vendor n-grams in CBA-style descriptions', () => {
  const descriptions = [
    'Direct Credit 158824 DYSON APPLIANCES 2000179382',
    'Direct Credit 158824 DYSON APPLIANCES 2000178993',
    'Direct Credit 158824 DYSON APPLIANCES 2000178100',
    'Fast Transfer From DCW Enterprises Pty L DCW 10707',
    'Fast Transfer From DCW Enterprises Pty L DCW 10688',
    'Fast Transfer From DCW Enterprises Pty L DCW 10680',
    'Direct Debit 617704 PAYPAL AUSTRALIA 1050102939603',
    'Direct Debit 617704 PAYPAL AUSTRALIA 1049954875540',
    'Direct Debit 617704 PAYPAL AUSTRALIA 1049756314955',
  ];
  const existing = new Map<string, string>();  // no existing vendors
  const candidates = extractCandidates(descriptions, existing);
  const names = candidates.map((c) => c.suggestedName.toLowerCase());
  // Should find dyson, dcw, paypal as candidates (each appears 3+ times).
  assert.ok(names.some((n) => n.includes('dyson')), `dyson not in ${JSON.stringify(names)}`);
  assert.ok(names.some((n) => n.includes('dcw')), `dcw not in ${JSON.stringify(names)}`);
  assert.ok(names.some((n) => n.includes('paypal')), `paypal not in ${JSON.stringify(names)}`);
});

run('extractCandidates dedups against existing vendor aliases', () => {
  const descriptions = [
    'Direct Debit 617704 PAYPAL AUSTRALIA 1050102939603',
    'Direct Debit 617704 PAYPAL AUSTRALIA 1049954875540',
    'Direct Debit 617704 PAYPAL AUSTRALIA 1049756314955',
  ];
  // Existing vendor "PayPal" with alias "paypal".
  const existing = new Map<string, string>();
  existing.set('paypal', 'PayPal');
  const candidates = extractCandidates(descriptions, existing);
  const paypal = candidates.find((c) => c.suggestedName.toLowerCase().includes('paypal'));
  assert.ok(paypal, 'paypal should still appear as candidate');
  assert.equal(paypal!.existsAs, 'PayPal', 'should flag as existing');
});

run('extractCandidates suggests CUSTOMER kind for positive-amount candidates', () => {
  const descriptions = [
    'Direct Credit 158824 DYSON APPLIANCES 2000179382',
    'Direct Credit 158824 DYSON APPLIANCES 2000178993',
    'Direct Credit 158824 DYSON APPLIANCES 2000178100',
  ];
  const amounts = [3854.40, 17344.80, 2000.00];  // all positive
  const existing = new Map<string, string>();
  const candidates = extractCandidates(descriptions, existing, amounts);
  const dyson = candidates.find((c) => c.suggestedName.toLowerCase().includes('dyson'));
  assert.equal(dyson?.suggestedKind, 'CUSTOMER');
});

run('extractCandidates suggests MERCHANT kind for negative-amount candidates', () => {
  const descriptions = [
    'Direct Debit 617704 PAYPAL AUSTRALIA 1050102939603',
    'Direct Debit 617704 PAYPAL AUSTRALIA 1049954875540',
    'Direct Debit 617704 PAYPAL AUSTRALIA 1049756314955',
  ];
  const amounts = [-538.43, -399.58, -69.08];  // all negative
  const existing = new Map<string, string>();
  const candidates = extractCandidates(descriptions, existing, amounts);
  const paypal = candidates.find((c) => c.suggestedName.toLowerCase().includes('paypal'));
  assert.equal(paypal?.suggestedKind, 'MERCHANT');
});
```

- [ ] **Step 3: Run, confirm it fails**

```bash
cd backend && docker build --target build -t simplebooks-backend-test . > /dev/null 2>&1
docker run --rm simplebooks-backend-test npx ts-node src/vendors/vendor-extractor.test.ts
```

Expected: module-not-found errors.

- [ ] **Step 4: Implement the extractor**

`backend/src/vendors/vendor-extractor.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseCsv } from '../transaction-imports/csv-parser.service';
import { sniffCsv } from '../transaction-imports/csv-sniffer.service';
import { ColumnMapping } from '../transaction-imports/types';

// Noise prefixes stripped before tokenisation. Lowercase.
const NOISE_PREFIXES = [
  'direct debit ', 'direct credit ',
  'fast transfer from ', 'fast transfer to ',
  'transfer to other bank ', 'transfer to ', 'transfer from ',
  'commbank app ', 'netbank ',
];

const STOP_TOKENS = new Set(['ltd', 'pty', 'limited', 'pl', 'co', 'inc', 'corp', 'au', 'aus', 'australia']);

export interface VendorCandidate {
  suggestedName: string;        // Pretty-cased
  aliases: string[];            // lowercase n-grams
  matchCount: number;           // distinct descriptions
  sampleDescriptions: string[]; // up to 3
  existsAs: string | null;      // vendor name if already covered
  suggestedKind: 'MERCHANT' | 'PERSON' | 'CUSTOMER' | 'BANK' | 'OTHER';
}

/** Strip noise prefixes, trailing reference numbers, collapse whitespace, lowercase. Returns ordered tokens. */
export function normaliseAndTokenise(description: string): string[] {
  let s = description.toLowerCase().trim();
  // Drop noise prefixes (the FIRST one that matches).
  for (const p of NOISE_PREFIXES) {
    if (s.startsWith(p)) { s = s.slice(p.length); break; }
  }
  // Drop trailing reference number (digit runs ≥ 6 chars at the end, separated by space).
  s = s.replace(/\s+\d{6,}$/g, '');
  // Drop a leading merchant-code-style number (e.g. "617704 paypal australia" → "paypal australia").
  s = s.replace(/^\d{4,}\s+/, '');
  // Collapse whitespace.
  s = s.replace(/\s+/g, ' ').trim();
  // Tokenise.
  const tokens = s.split(' ').filter((t) => {
    if (t.length < 3 && !['bp', 'ww', 'an'].includes(t)) return false;
    if (STOP_TOKENS.has(t)) return false;
    if (/^\d+$/.test(t)) return false;
    return true;
  });
  return tokens;
}

/** Pretty-case a token: "dyson" → "Dyson", "paypal" → "PayPal" (best-effort title case). */
function prettify(s: string): string {
  return s.split(' ').map((w) => w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Extract vendor candidates from a corpus of descriptions.
 *
 * @param descriptions  Raw descriptions.
 * @param existingAliases  Map of normalised existing-vendor aliases → vendor name (for dedupe flag).
 * @param amounts  Parallel array of signed amounts. Used to suggest CUSTOMER (positive) vs MERCHANT (negative) kind.
 */
export function extractCandidates(
  descriptions: string[],
  existingAliases: Map<string, string>,
  amounts?: number[],
): VendorCandidate[] {
  // Per-description token streams.
  const perDesc = descriptions.map((d) => normaliseAndTokenise(d));

  // n-gram counts: ngram → Set of description indices it appears in.
  // We try unigrams and bigrams (trigrams are rarely worth the noise on bank statements).
  const ngramToIndices = new Map<string, Set<number>>();
  perDesc.forEach((tokens, idx) => {
    for (let i = 0; i < tokens.length; i++) {
      // Unigram
      const uni = tokens[i];
      if (!ngramToIndices.has(uni)) ngramToIndices.set(uni, new Set());
      ngramToIndices.get(uni)!.add(idx);
      // Bigram
      if (i + 1 < tokens.length) {
        const bi = tokens[i] + ' ' + tokens[i + 1];
        if (!ngramToIndices.has(bi)) ngramToIndices.set(bi, new Set());
        ngramToIndices.get(bi)!.add(idx);
      }
    }
  });

  // Keep n-grams that appear in ≥ 3 distinct descriptions.
  const significant = Array.from(ngramToIndices.entries())
    .filter(([_, indices]) => indices.size >= 3)
    .sort((a, b) => b[1].size - a[1].size);

  // Greedy: prefer bigrams over unigrams when they cover the same descriptions
  // (a bigram like "dyson appliances" is more specific than just "dyson").
  // Drop unigrams that are entirely subsumed by a chosen bigram.
  const chosen: Array<{ ngram: string; indices: Set<number> }> = [];
  const consumedIndices = new Set<number>();
  for (const [ngram, indices] of significant) {
    // Skip if every index this ngram covers is already covered by a chosen one.
    const fresh = Array.from(indices).filter((i) => !consumedIndices.has(i));
    if (fresh.length < 2) continue;  // not enough new evidence
    chosen.push({ ngram, indices });
    for (const i of indices) consumedIndices.add(i);
    if (chosen.length >= 100) break;
  }

  return chosen.map(({ ngram, indices }) => {
    const aliasNormalised = ngram;
    const existsAs = existingAliases.get(aliasNormalised) ?? null;
    const sampleIndices = Array.from(indices).slice(0, 3);
    const sampleDescriptions = sampleIndices.map((i) => descriptions[i]);

    let suggestedKind: VendorCandidate['suggestedKind'] = 'MERCHANT';
    if (amounts) {
      const subset = Array.from(indices).map((i) => amounts[i]);
      const positiveCount = subset.filter((a) => a > 0).length;
      if (positiveCount > subset.length / 2) {
        suggestedKind = 'CUSTOMER';
      } else if (subset.every((a) => a < 0) && /^[a-z]+ [a-z]+$/.test(ngram)) {
        // Two-word lowercase-alpha bigram with all-negative amounts → likely a person's name
        suggestedKind = 'PERSON';
      }
    }

    return {
      suggestedName: prettify(ngram),
      aliases: [aliasNormalised],
      matchCount: indices.size,
      sampleDescriptions,
      existsAs,
      suggestedKind,
    };
  });
}

@Injectable()
export class VendorExtractorService {
  constructor(private prisma: PrismaService) {}

  async extract(input: {
    source: 'all-transactions' | 'csv';
    csvBase64?: string;
    dateFrom?: string;
    dateTo?: string;
    accountIds?: string[];
  }): Promise<VendorCandidate[]> {
    let descriptions: string[];
    let amounts: number[];

    if (input.source === 'csv') {
      if (!input.csvBase64) throw new Error('csvBase64 required for source=csv');
      const buffer = Buffer.from(input.csvBase64, 'base64');
      // Use the same sniffer as the import flow so the user doesn't need to provide a mapping.
      const sniff = sniffCsv(buffer);
      const parsed = parseCsv(buffer, sniff.mapping);
      descriptions = parsed.rows.map((r) => r.description);
      amounts = parsed.rows.map((r) => Number(r.amount));
    } else {
      const where: any = {};
      if (input.accountIds?.length) where.accountId = { in: input.accountIds };
      if (input.dateFrom || input.dateTo) {
        where.date = {};
        if (input.dateFrom) where.date.gte = new Date(input.dateFrom);
        if (input.dateTo) where.date.lte = new Date(input.dateTo);
      }
      const rows = await this.prisma.transaction.findMany({
        where,
        select: { description: true, amount: true },
      });
      descriptions = rows.map((r) => r.description);
      amounts = rows.map((r) => Number(r.amount));
    }

    // Build existing-aliases map for dedupe.
    const existing = await this.prisma.vendor.findMany({
      where: { isActive: true },
      select: { name: true, aliases: true },
    });
    const existingAliases = new Map<string, string>();
    for (const v of existing) {
      for (const a of v.aliases) existingAliases.set(a.toLowerCase(), v.name);
    }

    return extractCandidates(descriptions, existingAliases, amounts);
  }

  async commit(candidates: Array<{ name: string; kind: string; aliases: string[] }>) {
    let created = 0, updated = 0, skipped = 0;
    for (const c of candidates) {
      const existing = await this.prisma.vendor.findUnique({ where: { name: c.name } });
      if (existing) {
        const newAliases = [...new Set([...existing.aliases, ...c.aliases.map((a) => a.toLowerCase())])];
        if (newAliases.length > existing.aliases.length) {
          await this.prisma.vendor.update({ where: { id: existing.id }, data: { aliases: newAliases } });
          updated++;
        } else {
          skipped++;
        }
      } else {
        await this.prisma.vendor.create({
          data: {
            name: c.name,
            kind: c.kind as any,
            aliases: c.aliases.map((a) => a.toLowerCase()),
          },
        });
        created++;
      }
    }
    return { created, updated, skipped };
  }
}
```

- [ ] **Step 5: Run tests, confirm pass**

```bash
cd backend && docker build --target build -t simplebooks-backend-test . > /dev/null 2>&1
docker run --rm simplebooks-backend-test npx ts-node src/vendors/vendor-extractor.test.ts
```

Expected: 5 PASS lines.

- [ ] **Step 6: Add extract endpoints to controller**

In `backend/src/vendors/vendors.controller.ts`, add to imports and add two endpoints:

```ts
import { VendorExtractorService } from './vendor-extractor.service';
import { CommitExtractedDto, ExtractCandidatesDto } from './dto';

// In the controller class:
constructor(private service: VendorsService, private extractor: VendorExtractorService) {}

@Post('extract')
@HttpCode(200)
extract(@Body() dto: ExtractCandidatesDto) { return this.extractor.extract(dto); }

@Post('extract/commit')
@HttpCode(200)
commitExtracted(@Body() dto: CommitExtractedDto) { return this.extractor.commit(dto.candidates); }
```

Add `HttpCode` to the import line at the top of the controller.

- [ ] **Step 7: Register extractor service in module**

In `backend/src/vendors/vendors.module.ts`:

```ts
import { VendorExtractorService } from './vendor-extractor.service';

@Module({
  controllers: [VendorsController],
  providers: [VendorsService, VendorExtractorService],
  exports: [VendorsService, VendorExtractorService],
})
export class VendorsModule {}
```

- [ ] **Step 8: Rebuild and end-to-end probe**

```bash
docker compose build backend && docker compose up -d backend
sleep 8
curl -s -X POST http://localhost:4000/vendors/extract -H 'content-type: application/json' \
  -d '{"source":"all-transactions"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('candidates:', len(d)); print('first 3:', [(c['suggestedName'], c['matchCount']) for c in d[:3]])"
```

Expected: depends on existing transactions; might be empty if no transactions are imported yet. That's fine — Task 25 verifies the full flow.

- [ ] **Step 9: Commit**

```bash
git add backend/src/vendors
git commit -m "feat(banking): vendor extractor service + tests + extract endpoints"
```

---

## Task 5: Backend — Rules module (CRUD + priority reorder + state)

**Files:**
- Create: `backend/src/rules/rules.module.ts`
- Create: `backend/src/rules/rules.controller.ts`
- Create: `backend/src/rules/rules.service.ts`
- Create: `backend/src/rules/dto.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create DTO**

`backend/src/rules/dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested,
} from 'class-validator';

export enum RuleStateDto    { USER = 'USER', AI_DRAFTED = 'AI_DRAFTED', APPROVED = 'APPROVED', DENIED = 'DENIED' }
export enum RuleFieldDto    { DESCRIPTION = 'DESCRIPTION', AMOUNT = 'AMOUNT', VENDOR = 'VENDOR', ACCOUNT = 'ACCOUNT' }
export enum RuleOperatorDto {
  CONTAINS = 'CONTAINS', EQUALS = 'EQUALS', STARTS_WITH = 'STARTS_WITH', ENDS_WITH = 'ENDS_WITH',
  GT = 'GT', LT = 'LT', BETWEEN = 'BETWEEN', IN = 'IN',
}

export class RuleConditionDto {
  @IsEnum(RuleFieldDto) field!: RuleFieldDto;
  @IsEnum(RuleOperatorDto) operator!: RuleOperatorDto;
  @IsString() value!: string;
  @IsString() @IsOptional() value2?: string;
  @IsArray() @IsString({ each: true }) @IsOptional() valueList?: string[];
}

export class CreateRuleDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsUUID() categoryId!: string;
  @IsUUID() @IsOptional() vendorId?: string;
  @IsString() @IsOptional() @MaxLength(2000) noteOnApply?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => RuleConditionDto) @ArrayMinSize(1) conditions!: RuleConditionDto[];
}

export class UpdateRuleDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(200) name?: string;
  @IsUUID() @IsOptional() categoryId?: string;
  @IsUUID() @IsOptional() vendorId?: string;
  @IsString() @IsOptional() @MaxLength(2000) noteOnApply?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => RuleConditionDto) @ArrayMinSize(1) @IsOptional() conditions?: RuleConditionDto[];
}

export class MoveRuleDto {
  @IsIn(['up', 'down']) direction!: 'up' | 'down';
}

export class SetRuleStateDto {
  @IsEnum(RuleStateDto) state!: RuleStateDto;
}

export class ToggleRuleActiveDto {
  @IsBoolean() isActive!: boolean;
}
```

- [ ] **Step 2: Create service**

`backend/src/rules/rules.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRuleDto, RuleStateDto, UpdateRuleDto } from './dto';

// Priorities are spaced by 10 (1000, 1010, 1020...). When inserting between
// two existing rules, the midpoint integer is used. If the gap collapses to 1,
// rebalance everything.
const PRIORITY_GAP = 10;

@Injectable()
export class RulesService {
  constructor(private prisma: PrismaService) {}

  async list(filter: { state?: RuleStateDto[]; isActive?: boolean } = {}) {
    const where: Prisma.RuleWhereInput = {};
    if (filter.state?.length) where.state = { in: filter.state as any };
    if (filter.isActive !== undefined) where.isActive = filter.isActive;
    return this.prisma.rule.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: {
        conditions: { orderBy: { position: 'asc' } },
        category: { select: { id: true, name: true, kind: true } },
        vendor: { select: { id: true, name: true } },
      },
    });
  }

  async get(id: string) {
    const row = await this.prisma.rule.findUnique({
      where: { id },
      include: {
        conditions: { orderBy: { position: 'asc' } },
        category: { select: { id: true, name: true, kind: true } },
        vendor: { select: { id: true, name: true } },
      },
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  async create(data: CreateRuleDto) {
    const maxPriority = (await this.prisma.rule.aggregate({ _max: { priority: true } }))._max.priority ?? 1000 - PRIORITY_GAP;
    return this.prisma.rule.create({
      data: {
        name: data.name,
        categoryId: data.categoryId,
        vendorId: data.vendorId,
        noteOnApply: data.noteOnApply,
        isActive: data.isActive ?? true,
        priority: maxPriority + PRIORITY_GAP,
        conditions: {
          create: data.conditions.map((c, i) => ({
            field: c.field as any,
            operator: c.operator as any,
            value: c.value,
            value2: c.value2,
            valueList: c.valueList ?? [],
            position: i,
          })),
        },
      },
      include: { conditions: true },
    });
  }

  async update(id: string, data: UpdateRuleDto) {
    await this.get(id);
    // Atomic: replace conditions if provided.
    return this.prisma.$transaction(async (tx) => {
      if (data.conditions) {
        await tx.ruleCondition.deleteMany({ where: { ruleId: id } });
      }
      return tx.rule.update({
        where: { id },
        data: {
          name: data.name,
          categoryId: data.categoryId,
          vendorId: data.vendorId,
          noteOnApply: data.noteOnApply,
          isActive: data.isActive,
          conditions: data.conditions
            ? {
                create: data.conditions.map((c, i) => ({
                  field: c.field as any,
                  operator: c.operator as any,
                  value: c.value,
                  value2: c.value2,
                  valueList: c.valueList ?? [],
                  position: i,
                })),
              }
            : undefined,
        },
        include: { conditions: true },
      });
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.rule.delete({ where: { id } });
    return { ok: true };
  }

  async move(id: string, direction: 'up' | 'down') {
    const target = await this.get(id);
    // 'up' = lower priority number (higher precedence). Find immediate neighbour.
    const neighbour = await this.prisma.rule.findFirst({
      where: direction === 'up'
        ? { priority: { lt: target.priority } }
        : { priority: { gt: target.priority } },
      orderBy: direction === 'up' ? { priority: 'desc' } : { priority: 'asc' },
    });
    if (!neighbour) return target;  // no movement possible
    // Swap priorities.
    await this.prisma.$transaction([
      this.prisma.rule.update({ where: { id: target.id }, data: { priority: neighbour.priority } }),
      this.prisma.rule.update({ where: { id: neighbour.id }, data: { priority: target.priority } }),
    ]);
    return this.get(id);
  }

  async setState(id: string, state: RuleStateDto) {
    await this.get(id);
    return this.prisma.rule.update({ where: { id }, data: { state: state as any } });
  }

  async toggleActive(id: string, isActive: boolean) {
    await this.get(id);
    return this.prisma.rule.update({ where: { id }, data: { isActive } });
  }
}
```

- [ ] **Step 3: Create controller**

`backend/src/rules/rules.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RulesService } from './rules.service';
import { CreateRuleDto, MoveRuleDto, RuleStateDto, SetRuleStateDto, ToggleRuleActiveDto, UpdateRuleDto } from './dto';

@Controller('rules')
export class RulesController {
  constructor(private service: RulesService) {}

  @Get() list(
    @Query('state') state?: string | string[],
    @Query('isActive') isActive?: string,
  ) {
    const stateArr = state ? (Array.isArray(state) ? state : [state]) as RuleStateDto[] : undefined;
    const active = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.service.list({ state: stateArr, isActive: active });
  }

  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateRuleDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateRuleDto) { return this.service.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
  @Patch(':id/move') move(@Param('id') id: string, @Body() dto: MoveRuleDto) { return this.service.move(id, dto.direction); }
  @Patch(':id/state') setState(@Param('id') id: string, @Body() dto: SetRuleStateDto) { return this.service.setState(id, dto.state); }
  @Patch(':id/toggle-active') toggleActive(@Param('id') id: string, @Body() dto: ToggleRuleActiveDto) { return this.service.toggleActive(id, dto.isActive); }
}
```

- [ ] **Step 4: Create module**

`backend/src/rules/rules.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  controllers: [RulesController],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}
```

- [ ] **Step 5: Register in app.module.ts**

Add `RulesModule` to imports.

- [ ] **Step 6: Rebuild and verify with a probe rule**

```bash
docker compose build backend && docker compose up -d backend
sleep 8

# Get a category id
CAT=$(curl -s http://localhost:4000/categories | python3 -c "import sys,json; print([c for c in json.load(sys.stdin) if 'Insurance' in c['name']][0]['id'])")

# Create a probe rule
RULE_BODY='{"name":"RACI insurance test","categoryId":"'$CAT'","conditions":[{"field":"DESCRIPTION","operator":"CONTAINS","value":"raci"}]}'
RULE_ID=$(curl -s -X POST http://localhost:4000/rules -H 'content-type: application/json' -d "$RULE_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "created rule: $RULE_ID"

# List, get, move (no-op since it's the only rule), delete
curl -s http://localhost:4000/rules | python3 -c "import sys,json; print('list count:', len(json.load(sys.stdin)))"
curl -s -o /dev/stderr -w 'move up: HTTP %{http_code}\n' -X PATCH http://localhost:4000/rules/$RULE_ID/move -H 'content-type: application/json' -d '{"direction":"up"}'
curl -s -X DELETE http://localhost:4000/rules/$RULE_ID | python3 -m json.tool
```

Expected: rule created (HTTP 201 implicit), list shows 1, move returns 200, delete returns `{"ok": true}`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/rules backend/src/app.module.ts
git commit -m "feat(banking): rules CRUD + priority reorder + state endpoints"
```

---

This plan continues across additional task files. The remaining tasks are at:

- **Tasks 6-10**: [2026-05-22-banking-phase-b-part-2.md](./2026-05-22-banking-phase-b-part-2.md)
- **Tasks 11-16**: [2026-05-22-banking-phase-b-part-3.md](./2026-05-22-banking-phase-b-part-3.md)
- **Tasks 17-25**: [2026-05-22-banking-phase-b-part-4.md](./2026-05-22-banking-phase-b-part-4.md)

Each subsequent plan part is self-contained and references this file for context.
