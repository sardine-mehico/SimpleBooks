# Recurring Invoices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `RecurringRule` model with a first-class recurring-invoice template (full line items, dynamic-field substitution at generation, customer-derived billing company, hybrid templates) and rebuild the cron processor to generate invoices that flow through the existing `InvoiceMailService.send` pipeline for SEND_DIRECTLY rules.

**Architecture:** Backend gets a new `recurring-schedules` Settings module (catalog of interval definitions), a fully rebuilt `recurring` module (CRUD + processor), and two small shared utils (`paymentTermsOffsetDays`, `applyDynamicFields`) so the cron processor mirrors the invoice form's date/text logic. Frontend factors the shared invoice body (customer block + line items + payment-details footer) into a new `<InvoiceBodyEditor>` child mounted by both `InvoiceForm` and the new `RecurringForm`. The `/recurring` list, `/recurring/new`, `/recurring/[id]`, and `/settings/recurring-schedules` pages get built. Generated invoices for `SEND_DIRECTLY` rules are dispatched through `InvoiceMailService.send` — the retry-with-backoff and FAILED_TO_SEND notification machinery is already in place from the prior Send-Via feature.

**Tech Stack:** NestJS 10, Prisma 5, Postgres 17, Redis 7, BullMQ 5, Next.js 15 (App Router), React 19, Tailwind 3, Radix UI, `@phosphor-icons/react` (sidebar), `lucide-react` (everywhere else).

**Verification model:** There is no test suite in this repo (per `CLAUDE.md`). Each task verifies via `curl` against `http://localhost:4000`, direct Postgres queries (`docker exec simplebooks-postgres-1 psql ...`), or Playwright in the browser. The verification commands are inline at the end of each task.

**Spec:** [docs/superpowers/specs/2026-05-18-recurring-invoices-design.md](../specs/2026-05-18-recurring-invoices-design.md)

---

## Task 1: Schema migration (non-additive — requires volume wipe)

**Files:**
- Modify: `backend/prisma/schema.prisma`

The existing `RecurringRule` model + `RecurringFrequency` enum are replaced wholesale. Two new models and two new enums are introduced. The volume wipe at the end of this task is unavoidable — `prisma db push` cannot coerce existing rule rows into the new shape.

- [ ] **Step 1: Open the schema and locate the `RecurringFrequency` enum + `RecurringRule` model** (around line 152 and 160).

- [ ] **Step 2: Replace the enum and model with the new shape.** Delete the entire `enum RecurringFrequency { ... }` block and the entire `model RecurringRule { ... }` block. Insert in their place:

```prisma
enum RecurringIntervalUnit {
  DAYS
  WEEKS
  MONTHS
  YEARS
}

enum SendingOption {
  REVIEW_BEFORE_SENDING
  SEND_DIRECTLY
}

model RecurringSchedule {
  id            String                @id @default(uuid())
  name          String                @unique
  intervalUnit  RecurringIntervalUnit
  intervalCount Int
  isActive      Boolean               @default(true)
  createdAt     DateTime              @default(now())
  updatedAt     DateTime              @updatedAt

  recurringRules RecurringRule[]
}

model RecurringRule {
  id                  String         @id @default(uuid())
  scheduleName        String
  startDate           DateTime
  recurringScheduleId String?
  sendingOption       SendingOption  @default(REVIEW_BEFORE_SENDING)
  active              Boolean        @default(true)
  nextRunAt           DateTime
  customerId          String?
  billingCompanyId   String?
  poNumber            String?
  paymentDetails      String?
  internalNotes       String?
  terms               String?
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt

  recurringSchedule RecurringSchedule? @relation(fields: [recurringScheduleId], references: [id], onDelete: SetNull)
  customer          Customer?          @relation(fields: [customerId], references: [id], onDelete: SetNull)
  billingCompany    BillingCompany?    @relation(fields: [billingCompanyId], references: [id], onDelete: SetNull)
  lineItems         RecurringRuleLineItem[]
  invoices          Invoice[]
}

model RecurringRuleLineItem {
  id              String   @id @default(uuid())
  recurringRuleId String
  itemId          String?
  description     String
  unitPrice       Decimal  @db.Decimal(12, 2)
  taxTypeId       String?
  taxName         String?
  taxRate         Decimal? @db.Decimal(6, 3)
  position        Int      @default(0)

  recurringRule RecurringRule @relation(fields: [recurringRuleId], references: [id], onDelete: Cascade)
  item          Item?         @relation(fields: [itemId], references: [id], onDelete: SetNull)
}
```

- [ ] **Step 3: Add the new back-relation on `Item`.** The `Item` model currently has `invoiceItems InvoiceItem[]`. Add a second back-relation directly below it:

```prisma
model Item {
  // ...existing fields unchanged...

  invoiceItems        InvoiceItem[]
  recurringLineItems  RecurringRuleLineItem[]
}
```

- [ ] **Step 4: Add the back-relation on `BillingCompany`.** Below the existing `customers Customer[]` and `invoices Invoice[]` lines, add:

```prisma
model BillingCompany {
  // ...existing fields unchanged...

  customers       Customer[]
  invoices        Invoice[]
  recurringRules  RecurringRule[]
}
```

- [ ] **Step 5: Update the back-relation on `Customer`.** The existing `recurringRules RecurringRule[]` line is fine — leave it as-is. Sanity-check it's still there.

- [ ] **Step 6: Wipe Postgres + Redis volumes and rebuild.** The non-additive schema change means existing rows cannot be coerced.

```bash
docker compose down -v
docker compose up -d
```

- [ ] **Step 7: Wait for backend boot and verify the schema landed:**

```bash
sleep 15 && docker logs simplebooks-backend-1 2>&1 | tail -5
```

Expected: `[backend] listening on :4000` with no Prisma push errors.

```bash
docker exec simplebooks-postgres-1 psql -U postgres -d simplebooks -c "\dt"
```

Expected output contains the rows `RecurringRule`, `RecurringSchedule`, `RecurringRuleLineItem`, and does **not** contain `RecurringFrequency` (enums show in `\dT` not `\dt`):

```bash
docker exec simplebooks-postgres-1 psql -U postgres -d simplebooks -c "\dT"
```

Expected output contains `RecurringIntervalUnit` and `SendingOption`, does **not** contain `RecurringFrequency`.

- [ ] **Step 8: No commit yet — this repo isn't a git repo per `CLAUDE.md`. Proceed to Task 2.**

---

## Task 2: Seed RecurringSchedule catalog + sample RecurringRule

**Files:**
- Modify: `backend/prisma/seed.ts`

Repopulate the new tables on next boot. The seed already gates on `User` being empty, so we add the schedule rows + sample rule inside that block.

- [ ] **Step 1: Open `backend/prisma/seed.ts` and locate the section right before the existing recurring-rule seed.** Search for "RecurringRule" or `prisma.recurringRule.create`. Delete that existing block (it references the old flat fields and will fail).

- [ ] **Step 2: Add the new seed code before the seed file's closing `})()` or `main` invocation:**

```ts
// Recurring schedules catalog
const schedules = await Promise.all([
  prisma.recurringSchedule.upsert({
    where: { name: "Every week" },
    update: {},
    create: { name: "Every week", intervalUnit: "WEEKS", intervalCount: 1 },
  }),
  prisma.recurringSchedule.upsert({
    where: { name: "Every 2 weeks" },
    update: {},
    create: { name: "Every 2 weeks", intervalUnit: "WEEKS", intervalCount: 2 },
  }),
  prisma.recurringSchedule.upsert({
    where: { name: "Every 4 weeks" },
    update: {},
    create: { name: "Every 4 weeks", intervalUnit: "WEEKS", intervalCount: 4 },
  }),
  prisma.recurringSchedule.upsert({
    where: { name: "Every month" },
    update: {},
    create: { name: "Every month", intervalUnit: "MONTHS", intervalCount: 1 },
  }),
  prisma.recurringSchedule.upsert({
    where: { name: "Every quarter" },
    update: {},
    create: { name: "Every quarter", intervalUnit: "MONTHS", intervalCount: 3 },
  }),
  prisma.recurringSchedule.upsert({
    where: { name: "Every year" },
    update: {},
    create: { name: "Every year", intervalUnit: "YEARS", intervalCount: 1 },
  }),
]);
const monthly = schedules.find((s) => s.name === "Every month")!;

// Sample recurring rule — Monthly retainer for Alex Kurm with one dynamic-field line.
const firstCustomer = await prisma.customer.findFirst({ orderBy: { customerNumber: "asc" } });
if (firstCustomer && firstCustomer.billingCompanyId) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  await prisma.recurringRule.create({
    data: {
      scheduleName: `${firstCustomer.name} - ${monthly.name}`,
      startDate: tomorrow,
      recurringScheduleId: monthly.id,
      sendingOption: "REVIEW_BEFORE_SENDING",
      active: true,
      nextRunAt: tomorrow,
      customerId: firstCustomer.id,
      billingCompanyId: firstCustomer.billingCompanyId,
      lineItems: {
        create: [
          {
            description: "Monthly retainer for {{month-year}}",
            unitPrice: 1000,
            taxName: "GST",
            taxRate: 10,
            position: 0,
          },
        ],
      },
    },
  });
}
```

- [ ] **Step 3: Rebuild backend and re-seed by wiping + booting:**

```bash
docker compose down -v && docker compose up -d --build backend
sleep 15
docker logs simplebooks-backend-1 2>&1 | tail -5
```

Expected: `[backend] listening on :4000` with no errors.

- [ ] **Step 4: Verify schedules were seeded:**

```bash
curl -s http://localhost:4000/recurring-schedules 2>/dev/null || \
docker exec simplebooks-postgres-1 psql -U postgres -d simplebooks -c "SELECT name, \"intervalUnit\", \"intervalCount\" FROM \"RecurringSchedule\" ORDER BY \"intervalUnit\", \"intervalCount\";"
```

Note: the GET endpoint doesn't exist yet — the psql query is the fallback. Expected: 6 rows.

- [ ] **Step 5: Verify the sample rule was seeded:**

```bash
docker exec simplebooks-postgres-1 psql -U postgres -d simplebooks -c "SELECT \"scheduleName\", \"sendingOption\", active FROM \"RecurringRule\";"
```

Expected: 1 row like `Alex Kurm - Every month | REVIEW_BEFORE_SENDING | t`.

---

## Task 3: Backend shared utils (payment terms + dynamic fields)

**Files:**
- Create: `backend/src/common/payment-terms.util.ts`
- Create: `backend/src/common/dynamic-fields.util.ts`

The recurring processor needs the same `paymentTermsOffsetDays` mapping the invoice form uses, and the same `applyDynamicFields` substitution. Both currently live only in the frontend. Putting backend copies in `src/common/` keeps the processor stateless and lets the InvoicesService share later if needed.

- [ ] **Step 1: Create `backend/src/common/payment-terms.util.ts`:**

```ts
import { PaymentTerms } from '@prisma/client';

// Same table the invoice form uses for "Due Date auto-compute". Mirrors the
// frontend's `paymentTermsToOffsetDays` so generated invoices land on the same
// due date the user would have computed manually.
export function paymentTermsOffsetDays(p: PaymentTerms | null | undefined): number {
  switch (p) {
    case 'IN_28_DAYS':
      return 27;
    case 'IN_15_DAYS':
      return 14;
    case 'IN_7_DAYS':
      return 6;
    case 'DUE_ON_RECEIPT':
      return 0;
    default:
      return 0;
  }
}
```

- [ ] **Step 2: Create `backend/src/common/dynamic-fields.util.ts`:**

```ts
// Backend twin of frontend `lib/dynamic-fields.ts`. The recurring processor
// calls this on every line item description at generation time, with the
// generated invoice's actual dates as context. Token resolution is one-shot
// here too — the resulting string is frozen onto the InvoiceItem.

export type DynamicFieldsContext = {
  invoiceDate?: Date | null;
  dueDate?: Date | null;
};

function monthYearOf(d: Date): string {
  return `${d.toLocaleString('en-US', { month: 'long' })}-${d.getFullYear()}`;
}

function ddmmyyyyOf(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function applyDynamicFields(text: string, ctx: DynamicFieldsContext = {}): string {
  if (!text) return text;
  const monthYear = monthYearOf(ctx.invoiceDate ?? new Date());
  const invoiceDate = ctx.invoiceDate ? ddmmyyyyOf(ctx.invoiceDate) : '';
  const dueDate = ctx.dueDate ? ddmmyyyyOf(ctx.dueDate) : '';
  return text
    .replace(/\{\{\s*month-year\s*\}\}/gi, monthYear)
    .replace(/\{\{\s*invoice\s*date\s*\}\}/gi, invoiceDate)
    .replace(/\{\{\s*due\s*date\s*\}\}/gi, dueDate);
}
```

- [ ] **Step 3: Type check the utils compile.** No verification needed beyond the next task building successfully — these files have no runtime consumers yet.

---

## Task 4: RecurringSchedules backend module (CRUD)

**Files:**
- Create: `backend/src/recurring-schedules/dto.ts`
- Create: `backend/src/recurring-schedules/recurring-schedules.service.ts`
- Create: `backend/src/recurring-schedules/recurring-schedules.controller.ts`
- Create: `backend/src/recurring-schedules/recurring-schedules.module.ts`
- Modify: `backend/src/app.module.ts`

Tax-Types-style CRUD: list, get one, create, update, delete.

- [ ] **Step 1: Create the DTOs at `backend/src/recurring-schedules/dto.ts`:**

```ts
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { RecurringIntervalUnit } from '@prisma/client';

export class CreateRecurringScheduleDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsEnum(RecurringIntervalUnit) intervalUnit!: RecurringIntervalUnit;
  @Type(() => Number) @IsInt() @Min(1) intervalCount!: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateRecurringScheduleDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(80) name?: string;
  @IsEnum(RecurringIntervalUnit) @IsOptional() intervalUnit?: RecurringIntervalUnit;
  @Type(() => Number) @IsInt() @IsOptional() @Min(1) intervalCount?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
```

- [ ] **Step 2: Create the service at `backend/src/recurring-schedules/recurring-schedules.service.ts`:**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecurringScheduleDto, UpdateRecurringScheduleDto } from './dto';

@Injectable()
export class RecurringSchedulesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.recurringSchedule.findMany({ orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    const row = await this.prisma.recurringSchedule.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  create(data: CreateRecurringScheduleDto) {
    return this.prisma.recurringSchedule.create({
      data: { ...data, isActive: data.isActive ?? true },
    });
  }

  async update(id: string, data: UpdateRecurringScheduleDto) {
    await this.get(id);
    return this.prisma.recurringSchedule.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.recurringSchedule.delete({ where: { id } });
    return { ok: true };
  }
}
```

- [ ] **Step 3: Create the controller at `backend/src/recurring-schedules/recurring-schedules.controller.ts`:**

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RecurringSchedulesService } from './recurring-schedules.service';
import { CreateRecurringScheduleDto, UpdateRecurringScheduleDto } from './dto';

@Controller('recurring-schedules')
export class RecurringSchedulesController {
  constructor(private svc: RecurringSchedulesService) {}

  @Get() list() { return this.svc.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.svc.get(id); }
  @Post() create(@Body() dto: CreateRecurringScheduleDto) { return this.svc.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateRecurringScheduleDto) { return this.svc.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }
}
```

- [ ] **Step 4: Create the module at `backend/src/recurring-schedules/recurring-schedules.module.ts`:**

```ts
import { Module } from '@nestjs/common';
import { RecurringSchedulesController } from './recurring-schedules.controller';
import { RecurringSchedulesService } from './recurring-schedules.service';

@Module({
  controllers: [RecurringSchedulesController],
  providers: [RecurringSchedulesService],
  exports: [RecurringSchedulesService],
})
export class RecurringSchedulesModule {}
```

- [ ] **Step 5: Register the module in `backend/src/app.module.ts`.** Find the imports section and add:

```ts
import { RecurringSchedulesModule } from './recurring-schedules/recurring-schedules.module';
```

Then add `RecurringSchedulesModule` to the `imports: [...]` array (next to `TaxTypesModule`).

- [ ] **Step 6: Rebuild and verify:**

```bash
docker compose build backend && docker compose up -d backend
sleep 12
curl -s http://localhost:4000/recurring-schedules | python3 -m json.tool | head -40
```

Expected: a JSON array with the 6 seeded schedules. Each entry has `id`, `name`, `intervalUnit`, `intervalCount`, `isActive: true`, timestamps.

- [ ] **Step 7: Smoke-test mutation:**

```bash
curl -s -X POST http://localhost:4000/recurring-schedules \
  -H 'content-type: application/json' \
  -d '{"name":"Every 6 months","intervalUnit":"MONTHS","intervalCount":6}' | python3 -m json.tool
```

Expected: 201-style JSON with the created row.

```bash
curl -s http://localhost:4000/recurring-schedules | python3 -c "import json,sys;print(len(json.load(sys.stdin)))"
```

Expected: `7`. Then delete it back to 6:

```bash
ID=$(curl -s http://localhost:4000/recurring-schedules | python3 -c "import json,sys; [print(r['id']) for r in json.load(sys.stdin) if r['name']=='Every 6 months']")
curl -s -X DELETE http://localhost:4000/recurring-schedules/$ID
```

---

## Task 5: Recurring DTOs (Create / Update)

**Files:**
- Create: `backend/src/recurring/dto.ts`

The DTOs enforce the spec's Save-validation rules at the API boundary (rule #2 from the recurring discussion).

- [ ] **Step 1: Create `backend/src/recurring/dto.ts`:**

```ts
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { SendingOption } from '@prisma/client';

export class RecurringLineItemDto {
  @IsString() @IsOptional() id?: string;
  @IsString() @IsOptional() itemId?: string;
  @IsString() description!: string;
  @Type(() => Number) @IsNumber() @Min(0) unitPrice!: number;
  @IsString() @IsOptional() taxTypeId?: string;
  @IsString() @IsOptional() taxName?: string;
  @Type(() => Number) @IsNumber() @IsOptional() @Min(0) taxRate?: number;
}

export class CreateRecurringRuleDto {
  // Schedule Name is derived server-side from customer + schedule, so we
  // intentionally do not accept it from the client.
  @IsISO8601() startDate!: string;
  @IsString() recurringScheduleId!: string;
  @IsEnum(SendingOption) @IsOptional() sendingOption?: SendingOption;
  @IsBoolean() @IsOptional() active?: boolean;
  @IsString() customerId!: string;
  @IsString() @IsOptional() poNumber?: string;
  @IsString() @IsOptional() paymentDetails?: string;
  @IsString() @IsOptional() internalNotes?: string;
  @IsString() @IsOptional() terms?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RecurringLineItemDto)
  lineItems!: RecurringLineItemDto[];
}

export class UpdateRecurringRuleDto {
  @IsISO8601() @IsOptional() startDate?: string;
  @IsString() @IsOptional() recurringScheduleId?: string;
  @IsEnum(SendingOption) @IsOptional() sendingOption?: SendingOption;
  @IsBoolean() @IsOptional() active?: boolean;
  @IsString() @IsOptional() customerId?: string;
  @IsString() @IsOptional() poNumber?: string;
  @IsString() @IsOptional() paymentDetails?: string;
  @IsString() @IsOptional() internalNotes?: string;
  @IsString() @IsOptional() terms?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecurringLineItemDto)
  @IsOptional()
  lineItems?: RecurringLineItemDto[];
}
```

---

## Task 6: Recurring service — full CRUD + scheduleName derivation

**Files:**
- Replace: `backend/src/recurring/recurring.service.ts`

The current file only has `list()` and `onModuleInit()`. The new file keeps boot-time queue registration intact and adds `get / create / update / remove`. `scheduleName` is derived from `<customer.name> - <schedule.name>` at save time.

- [ ] **Step 1: Replace the entire contents of `backend/src/recurring/recurring.service.ts`:**

```ts
import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PreferencesService } from '../preferences/preferences.service';
import { RECURRING_QUEUE } from './recurring.constants';
import { CreateRecurringRuleDto, UpdateRecurringRuleDto } from './dto';

@Injectable()
export class RecurringService implements OnModuleInit {
  private readonly log = new Logger(RecurringService.name);

  constructor(
    private prisma: PrismaService,
    private prefs: PreferencesService,
    @InjectQueue(RECURRING_QUEUE) private queue: Queue,
  ) {}

  async onModuleInit() {
    let tz = 'UTC';
    try {
      tz = await this.prefs.getTimezone();
    } catch (e) {
      this.log.warn(`Could not read preferences (using UTC): ${(e as Error).message}`);
    }
    this.log.log(`Scheduling recurring sweep in timezone ${tz}`);
    await this.queue.add(
      'sweep',
      {},
      {
        repeat: { pattern: '* * * * *', tz },
        removeOnComplete: 100,
        removeOnFail: 50,
        jobId: 'recurring-sweep',
      },
    );
  }

  list() {
    return this.prisma.recurringRule.findMany({
      orderBy: [{ active: 'desc' }, { scheduleName: 'asc' }],
      include: { customer: true, billingCompany: true, recurringSchedule: true, lineItems: true },
    });
  }

  async get(id: string) {
    const row = await this.prisma.recurringRule.findUnique({
      where: { id },
      include: {
        customer: { include: { billingCompany: true } },
        billingCompany: true,
        recurringSchedule: true,
        lineItems: { orderBy: { position: 'asc' } },
      },
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  private async deriveScheduleName(customerId: string, scheduleId: string): Promise<string> {
    const [customer, schedule] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId } }),
      this.prisma.recurringSchedule.findUnique({ where: { id: scheduleId } }),
    ]);
    const c = customer?.name ?? 'Unknown customer';
    const s = schedule?.name ?? 'Unknown schedule';
    return `${c} - ${s}`;
  }

  async create(data: CreateRecurringRuleDto) {
    // Resolve customer + billing company at save (mirrors how invoices store
    // `billingCompanyId` derived from the customer's link).
    const customer = await this.prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { billingCompanyId: true },
    });
    const scheduleName = await this.deriveScheduleName(data.customerId, data.recurringScheduleId);

    return this.prisma.recurringRule.create({
      data: {
        scheduleName,
        startDate: new Date(data.startDate),
        recurringScheduleId: data.recurringScheduleId,
        sendingOption: data.sendingOption ?? 'REVIEW_BEFORE_SENDING',
        active: data.active ?? true,
        // First run aligns with startDate. Once the sweep processes it,
        // `nextRunAt` advances by the schedule's interval.
        nextRunAt: new Date(data.startDate),
        customerId: data.customerId,
        billingCompanyId: customer?.billingCompanyId ?? null,
        poNumber: data.poNumber,
        paymentDetails: data.paymentDetails,
        internalNotes: data.internalNotes,
        terms: data.terms,
        lineItems: {
          create: data.lineItems.map((l, idx) => ({
            itemId: l.itemId || null,
            description: l.description,
            unitPrice: l.unitPrice,
            taxTypeId: l.taxTypeId,
            taxName: l.taxName,
            taxRate: l.taxRate,
            position: idx,
          })),
        },
      },
      include: { lineItems: true },
    });
  }

  async update(id: string, data: UpdateRecurringRuleDto) {
    const existing = await this.get(id);

    // Re-derive scheduleName if customer or schedule changed.
    let scheduleName: string | undefined;
    const nextCustomerId = data.customerId ?? existing.customerId;
    const nextScheduleId = data.recurringScheduleId ?? existing.recurringScheduleId;
    if (nextCustomerId && nextScheduleId) {
      if (data.customerId !== undefined || data.recurringScheduleId !== undefined) {
        scheduleName = await this.deriveScheduleName(nextCustomerId, nextScheduleId);
      }
    }

    // Re-resolve billingCompanyId when customer changes.
    let billingCompanyId: string | null | undefined;
    if (data.customerId !== undefined && data.customerId !== existing.customerId) {
      const customer = data.customerId
        ? await this.prisma.customer.findUnique({ where: { id: data.customerId }, select: { billingCompanyId: true } })
        : null;
      billingCompanyId = customer?.billingCompanyId ?? null;
    }

    const headerOnly = {
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      recurringScheduleId: data.recurringScheduleId,
      sendingOption: data.sendingOption,
      active: data.active,
      customerId: data.customerId,
      billingCompanyId,
      poNumber: data.poNumber,
      paymentDetails: data.paymentDetails,
      internalNotes: data.internalNotes,
      terms: data.terms,
      scheduleName,
    };

    if (!data.lineItems) {
      return this.prisma.recurringRule.update({
        where: { id },
        data: headerOnly,
        include: { lineItems: true },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.recurringRuleLineItem.deleteMany({ where: { recurringRuleId: id } });
      return tx.recurringRule.update({
        where: { id },
        data: {
          ...headerOnly,
          lineItems: {
            create: data.lineItems!.map((l, idx) => ({
              itemId: l.itemId || null,
              description: l.description,
              unitPrice: l.unitPrice,
              taxTypeId: l.taxTypeId,
              taxName: l.taxName,
              taxRate: l.taxRate,
              position: idx,
            })),
          },
        },
        include: { lineItems: true },
      });
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.recurringRule.delete({ where: { id } });
    return { ok: true };
  }
}
```

---

## Task 7: Recurring controller — REST endpoints

**Files:**
- Replace: `backend/src/recurring/recurring.controller.ts`

- [ ] **Step 1: Replace the controller contents:**

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RecurringService } from './recurring.service';
import { CreateRecurringRuleDto, UpdateRecurringRuleDto } from './dto';

@Controller('recurring')
export class RecurringController {
  constructor(private recurring: RecurringService) {}

  @Get() list() { return this.recurring.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.recurring.get(id); }
  @Post() create(@Body() dto: CreateRecurringRuleDto) { return this.recurring.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateRecurringRuleDto) { return this.recurring.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.recurring.remove(id); }
}
```

- [ ] **Step 2: Rebuild and verify the CRUD endpoints are wired (the processor isn't replaced yet — that's Task 8 — but the controller will boot fine):**

```bash
docker compose build backend && docker compose up -d backend
sleep 12
docker logs simplebooks-backend-1 2>&1 | grep -E "RecurringController|RecurringSchedulesController|invoice-mail" | head
```

Expected: route mappings for `GET/POST/PATCH/DELETE /recurring` and `/recurring-schedules`.

- [ ] **Step 3: Smoke-test list:**

```bash
curl -s http://localhost:4000/recurring | python3 -c "import json,sys;rows=json.load(sys.stdin);print(len(rows),'rules'); [print(r['scheduleName'], r['sendingOption'], r['active']) for r in rows]"
```

Expected: `1 rules` + one line showing the seeded rule.

---

## Task 8: Recurring processor — generation logic

**Files:**
- Replace: `backend/src/recurring/recurring.processor.ts`

The new processor walks all due, generable rules and, for each, builds a `CreateInvoiceDto` from the rule's resolved line items and hands it to `InvoicesService.create`. For SEND_DIRECTLY rules it then calls `InvoiceMailService.send`. Advancement of `nextRunAt` happens last regardless of send outcome.

- [ ] **Step 1: Replace `backend/src/recurring/recurring.processor.ts`:**

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { InvoiceMailService } from '../mail/invoice-mail.service';
import { paymentTermsOffsetDays } from '../common/payment-terms.util';
import { applyDynamicFields } from '../common/dynamic-fields.util';
import { RECURRING_QUEUE } from './recurring.constants';

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function addMonths(d: Date, months: number): Date {
  // Calendar-month math with day-of-month clamping (Jan 31 + 1 month = Feb 28/29).
  const out = new Date(d);
  const targetMonth = out.getMonth() + months;
  const targetYear = out.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastOfTarget = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  out.setFullYear(targetYear, normalizedMonth, Math.min(out.getDate(), lastOfTarget));
  return out;
}

function advanceNextRun(current: Date, unit: string, count: number): Date {
  switch (unit) {
    case 'DAYS':   return addDays(current, count);
    case 'WEEKS':  return addDays(current, count * 7);
    case 'MONTHS': return addMonths(current, count);
    case 'YEARS':  return addMonths(current, count * 12);
    default:       return addDays(current, count);
  }
}

@Processor(RECURRING_QUEUE)
export class RecurringProcessor extends WorkerHost {
  private readonly log = new Logger(RecurringProcessor.name);

  constructor(
    private prisma: PrismaService,
    private invoices: InvoicesService,
    private invoiceMail: InvoiceMailService,
  ) {
    super();
  }

  async process(_job: Job) {
    const now = new Date();
    const due = await this.prisma.recurringRule.findMany({
      where: { active: true, nextRunAt: { lte: now } },
      include: {
        customer: { include: { billingCompany: true } },
        recurringSchedule: true,
        lineItems: { orderBy: { position: 'asc' } },
      },
    });

    for (const rule of due) {
      // Skip conditions — log and leave nextRunAt alone for next sweep.
      if (!rule.customer) {
        this.log.warn(`Skip rule ${rule.id}: customer missing`);
        continue;
      }
      if (!rule.customer.billingCompany) {
        this.log.warn(`Skip rule ${rule.id}: customer has no billing company`);
        continue;
      }
      if (!rule.recurringSchedule) {
        this.log.warn(`Skip rule ${rule.id}: schedule missing`);
        continue;
      }
      if (rule.lineItems.length === 0) {
        this.log.warn(`Skip rule ${rule.id}: no line items`);
        continue;
      }

      // Dates.
      const invoiceDate = new Date(now);
      invoiceDate.setHours(0, 0, 0, 0);
      const dueDate = addDays(invoiceDate, paymentTermsOffsetDays(rule.customer.paymentTerms));

      // Build CreateInvoiceDto — token-resolved descriptions, qty=1, unitPrice=amount.
      const dto = {
        invoiceDate: invoiceDate.toISOString(),
        dueDate: dueDate.toISOString(),
        customerId: rule.customerId ?? undefined,
        billingCompanyId: rule.billingCompanyId ?? undefined,
        status: 'DRAFT' as const,
        poNumber: rule.poNumber ?? undefined,
        paymentDetails: rule.paymentDetails ?? undefined,
        internalNotes: rule.internalNotes ?? undefined,
        terms: rule.terms ?? undefined,
        lineItems: rule.lineItems.map((l) => ({
          itemId: l.itemId ?? undefined,
          description: applyDynamicFields(l.description, { invoiceDate, dueDate }),
          quantity: 1,
          unitPrice: Number(l.unitPrice),
          taxTypeId: l.taxTypeId ?? undefined,
          taxName: l.taxName ?? undefined,
          taxRate: l.taxRate != null ? Number(l.taxRate) : undefined,
        })),
      };

      let invoice: { id: string; invoiceNumber: number };
      try {
        invoice = await this.invoices.create(dto as any);
      } catch (e) {
        this.log.error(`Rule ${rule.id} invoice create failed: ${(e as Error).message}`);
        continue; // don't advance nextRunAt — try again next sweep
      }

      // Stamp back-reference (InvoicesService.create doesn't accept recurringRuleId in its DTO).
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { recurringRuleId: rule.id },
      });
      this.log.log(`Generated INV-${invoice.invoiceNumber} from rule ${rule.id}`);

      // SEND_DIRECTLY → through the manual-send pipeline (sync attempt + queued retries + notifications).
      if (rule.sendingOption === 'SEND_DIRECTLY') {
        await this.invoiceMail.send(invoice.id).catch((e) => {
          // InvoiceMailService.send shouldn't throw — it returns a status — but be defensive.
          this.log.warn(`SEND_DIRECTLY send threw for INV-${invoice.invoiceNumber}: ${(e as Error).message}`);
        });
      }

      // Advance nextRunAt regardless of send outcome.
      const next = advanceNextRun(
        rule.nextRunAt,
        rule.recurringSchedule.intervalUnit,
        rule.recurringSchedule.intervalCount,
      );
      await this.prisma.recurringRule.update({
        where: { id: rule.id },
        data: { nextRunAt: next },
      });
    }
  }
}
```

---

## Task 9: Recurring module wiring

**Files:**
- Modify: `backend/src/recurring/recurring.module.ts`

The processor now depends on `InvoicesService` and `InvoiceMailService`. Import those modules.

- [ ] **Step 1: Replace `backend/src/recurring/recurring.module.ts`:**

```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RecurringController } from './recurring.controller';
import { RecurringService } from './recurring.service';
import { RecurringProcessor } from './recurring.processor';
import { RECURRING_QUEUE } from './recurring.constants';
import { InvoicesModule } from '../invoices/invoices.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [BullModule.registerQueue({ name: RECURRING_QUEUE }), InvoicesModule, MailModule],
  controllers: [RecurringController],
  providers: [RecurringService, RecurringProcessor],
})
export class RecurringModule {}
```

- [ ] **Step 2: Rebuild and verify boot:**

```bash
docker compose build backend && docker compose up -d backend
sleep 15
docker logs simplebooks-backend-1 2>&1 | tail -15
```

Expected: backend boots cleanly, all route mappings logged, `Scheduling recurring sweep in timezone Australia/Perth` line present, no DI errors. The first sweep tick fires within a minute.

- [ ] **Step 3: Force an immediate sweep by setting the sample rule's `nextRunAt` to the past, then wait a minute:**

```bash
docker exec simplebooks-postgres-1 psql -U postgres -d simplebooks -c \
  "UPDATE \"RecurringRule\" SET \"nextRunAt\" = NOW() - INTERVAL '1 day' WHERE active = true;"
sleep 70
```

- [ ] **Step 4: Verify an invoice was generated by the sweep:**

```bash
curl -s http://localhost:4000/invoices | python3 -c "
import json, sys
rows = json.load(sys.stdin)
gen = [r for r in rows if r.get('recurringRuleId')]
print('Generated invoices:', len(gen))
for r in gen[:3]:
    print(' INV-{} | total={} | line desc='.format(r['invoiceNumber'], r['totalAmount']),
          r['customer']['name'] if r.get('customer') else '-')
"
docker exec simplebooks-postgres-1 psql -U postgres -d simplebooks -c \
  "SELECT description FROM \"InvoiceItem\" WHERE \"invoiceId\" IN (SELECT id FROM \"Invoice\" WHERE \"recurringRuleId\" IS NOT NULL) ORDER BY \"position\";"
```

Expected:
- At least 1 generated invoice.
- The line description contains the resolved month-year (e.g. `Monthly retainer for May-2026`), **not** the raw `{{month-year}}` token.
- The rule's `nextRunAt` has advanced — verify:

```bash
docker exec simplebooks-postgres-1 psql -U postgres -d simplebooks -c \
  "SELECT \"scheduleName\", \"nextRunAt\" FROM \"RecurringRule\";"
```

Expected: `nextRunAt` is now ~30 days in the future (Every month + clamped day-of-month).

---

## Task 10: Frontend types — RecurringSchedule + RecurringRule + RecurringRuleLineItem

**Files:**
- Modify: `frontend/lib/types.ts`

- [ ] **Step 1: Open `frontend/lib/types.ts`. Locate the existing `RecurringFrequency` type and any `RecurringRule` type (if present).** Delete them.

- [ ] **Step 2: Add the new types just after the existing `TaxType` definition:**

```ts
export type RecurringIntervalUnit = "DAYS" | "WEEKS" | "MONTHS" | "YEARS";
export const RECURRING_INTERVAL_UNITS: { value: RecurringIntervalUnit; label: string }[] = [
  { value: "DAYS", label: "Day(s)" },
  { value: "WEEKS", label: "Week(s)" },
  { value: "MONTHS", label: "Month(s)" },
  { value: "YEARS", label: "Year(s)" },
];

export type SendingOption = "REVIEW_BEFORE_SENDING" | "SEND_DIRECTLY";
export const SENDING_OPTIONS: { value: SendingOption; label: string }[] = [
  { value: "REVIEW_BEFORE_SENDING", label: "Review before sending" },
  { value: "SEND_DIRECTLY", label: "Send directly to client" },
];

export type RecurringSchedule = {
  id: string;
  name: string;
  intervalUnit: RecurringIntervalUnit;
  intervalCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RecurringRuleLineItem = {
  id?: string;
  itemId?: string | null;
  description: string;
  unitPrice: string | number;
  taxTypeId?: string | null;
  taxName?: string | null;
  taxRate?: string | number | null;
  position?: number;
};

export type RecurringRule = {
  id: string;
  scheduleName: string;
  startDate: string;
  recurringScheduleId?: string | null;
  recurringSchedule?: RecurringSchedule | null;
  sendingOption: SendingOption;
  active: boolean;
  nextRunAt: string;
  customerId?: string | null;
  customer?: Customer | null;
  billingCompanyId?: string | null;
  billingCompany?: BillingCompany | null;
  poNumber?: string | null;
  paymentDetails?: string | null;
  internalNotes?: string | null;
  terms?: string | null;
  lineItems?: RecurringRuleLineItem[];
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 3: Frontend type check by rebuilding:**

```bash
docker compose build frontend 2>&1 | tail -10
```

Expected: no TypeScript errors. If any reference to the old `RecurringFrequency` survives elsewhere in the frontend, fix them (likely in `frontend/components/recurring/recurring-list.tsx` — see Task 14).

---

## Task 11: Extract `<InvoiceBodyEditor>` and refactor `InvoiceForm`

**Files:**
- Create: `frontend/components/invoices/invoice-body-editor.tsx`
- Modify: `frontend/components/invoices/invoice-form.tsx`

Move Cards 2 (From / Customer block), 3 (Line items grid), and 4 (Footer — Payment Details / Internal Notes / Terms) into a new shared child. `InvoiceForm` continues to render Card 1 (right-column metadata + status badge) and the FormActions / SendInvoiceDialog tail.

This is the largest task. Take it slow.

- [ ] **Step 1: Create `frontend/components/invoices/invoice-body-editor.tsx` with the shared state + JSX.** The component is essentially the existing `InvoiceForm` body, cut from the parent and re-rooted into a child that takes props. Full content:

```tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { RichTextView } from "@/components/ui/rich-text-view";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { applyDynamicFields } from "@/lib/dynamic-fields";
import type { BillingCompany, Customer, Item, TaxType } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

export type BodyLine = {
  itemId: string;
  description: string;
  amount: string;
  taxTypeId: string;
  taxName: string;
  taxRate: string;
};

export const blankBodyLine = (defaultTax?: TaxType | null): BodyLine => ({
  itemId: "",
  description: "",
  amount: "0",
  taxTypeId: defaultTax?.id ?? "",
  taxName: defaultTax?.name ?? "",
  taxRate: defaultTax ? String(defaultTax.rate) : "",
});

export function deriveTaxLabel(lines: BodyLine[]): string {
  const names = new Set(lines.map((l) => l.taxName).filter(Boolean));
  if (names.size === 0) return "Tax";
  if (names.size === 1) return [...names][0]!;
  return "TAX";
}

export type InvoiceBodyEditorProps = {
  customers: Customer[];
  items: Item[];
  taxTypes: TaxType[];
  customerId: string;
  setCustomerId: (id: string) => void;
  invoiceDate: string;
  dueDate: string;
  lines: BodyLine[];
  setLines: React.Dispatch<React.SetStateAction<BodyLine[]>>;
  paymentDetails: string;
  setPaymentDetails: (v: string) => void;
  internalNotes: string;
  setInternalNotes: (v: string) => void;
  terms: string;
  setTerms: (v: string) => void;
};

export function InvoiceBodyEditor({
  customers,
  items,
  taxTypes,
  customerId,
  setCustomerId,
  invoiceDate,
  dueDate,
  lines,
  setLines,
  paymentDetails,
  setPaymentDetails,
  internalNotes,
  setInternalNotes,
  terms,
  setTerms,
}: InvoiceBodyEditorProps) {
  const activeTaxTypes = useMemo(() => taxTypes.filter((t) => t.isActive), [taxTypes]);
  const defaultTax = activeTaxTypes[0] ?? null;

  const customer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId],
  );
  const billingCompany = customer?.billingCompany ?? null;

  // Auto-populate Payment Details from billing company on customer change.
  // Skip first render so editing an existing record doesn't clobber saved
  // value.
  const isFirstPaymentRun = useRef(true);
  useEffect(() => {
    if (isFirstPaymentRun.current) {
      isFirstPaymentRun.current = false;
      return;
    }
    const next = customers.find((c) => c.id === customerId)?.billingCompany?.paymentDetails ?? "";
    setPaymentDetails(next);
  }, [customerId, customers, setPaymentDetails]);

  function updateLine(idx: number, patch: Partial<BodyLine>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function pickItem(idx: number, itemId: string) {
    const it = items.find((x) => x.id === itemId);
    if (!it) return;
    const sourceText = it.description?.trim() ? it.description : it.name;
    const description = applyDynamicFields(sourceText, { invoiceDate, dueDate });
    updateLine(idx, {
      itemId,
      description,
      amount: String(it.unitPrice),
    });
  }

  function pickTax(idx: number, taxTypeId: string) {
    const t = taxTypes.find((x) => x.id === taxTypeId);
    if (!t) {
      updateLine(idx, { taxTypeId: "", taxName: "", taxRate: "" });
      return;
    }
    updateLine(idx, { taxTypeId: t.id, taxName: t.name, taxRate: String(t.rate) });
  }

  const totals = useMemo(() => {
    let sub = 0;
    let tax = 0;
    for (const l of lines) {
      const amount = Number(l.amount) || 0;
      const rate = Number(l.taxRate) || 0;
      sub += amount;
      tax += amount * (rate / 100);
    }
    sub = Math.round(sub * 100) / 100;
    tax = Math.round(tax * 100) / 100;
    return { subtotal: sub, taxAmount: tax, totalAmount: sub + tax };
  }, [lines]);

  const taxLabel = useMemo(() => deriveTaxLabel(lines), [lines]);

  return (
    <>
      <Card className="p-6">
        <div className="space-y-6">
          {/* "From" + Customer + Customer address */}
          <div className="text-sm leading-relaxed text-slate-700">
            {billingCompany ? (
              <>
                <div className="text-base font-semibold text-slate-900">{billingCompany.name}</div>
                {billingCompany.abn ? <div>ABN: {billingCompany.abn}</div> : null}
                {billingCompany.address ? (
                  <RichTextView text={billingCompany.address} className="text-sm text-slate-700" />
                ) : null}
                {billingCompany.accountsEmail ? <div>E: {billingCompany.accountsEmail}</div> : null}
              </>
            ) : (
              <div className="text-sm italic text-slate-400">
                Select a customer to populate billing company details.
              </div>
            )}
          </div>

          <Field label="Customer">
            <Select value={customerId || "__none__"} onValueChange={(v) => setCustomerId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="max-w-[320px]">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {customer?.address ? (
            <RichTextView text={customer.address} className="-mt-[18px] text-sm text-slate-700" />
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {!customerId ? (
          <div className="border-b border-amber-100 bg-amber-50/60 px-5 py-2.5 text-xs text-amber-800">
            Select a customer to add line items.
          </div>
        ) : null}
        <div className="grid grid-cols-[1fr_140px_180px_40px] gap-x-3 bg-slate-50 px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
          <div>Items &amp; Description</div>
          <div className="text-right">Amount</div>
          <div>Tax</div>
          <div />
        </div>
        <ul className="divide-y divide-slate-100">
          {lines.map((l, idx) => (
            <li key={idx} className="grid grid-cols-[1fr_140px_180px_40px] items-center gap-x-3 px-5 py-3">
              <BodyItemDescriptionField
                value={l.description}
                items={items}
                onChangeText={(v) => updateLine(idx, { description: v, itemId: "" })}
                onPickItem={(id) => pickItem(idx, id)}
                placeholder="Item / service description"
                disabled={!customerId}
              />
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-slate-400">$</span>
                <Input
                  type="number" step="0.01" min="0"
                  value={l.amount}
                  onChange={(e) => updateLine(idx, { amount: e.target.value })}
                  className="h-9 pl-5 text-right tabular-nums"
                  disabled={!customerId}
                />
              </div>
              <Select value={l.taxTypeId || "__none__"} onValueChange={(v) => pickTax(idx, v === "__none__" ? "" : v)} disabled={!customerId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select tax" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No tax</SelectItem>
                  {activeTaxTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} {Number(t.rate)}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
                disabled={!customerId}
                className="grid h-8 w-8 place-items-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                aria-label="Remove line"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 px-5 py-3">
          <Button
            type="button" variant="ghost" size="sm"
            onClick={() => setLines((l) => [...l, blankBodyLine(defaultTax)])}
            disabled={!customerId}
            className="text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Line Item
          </Button>
        </div>
        <div className="flex justify-end border-t border-slate-100 px-5 py-4">
          <div className="grid w-72 grid-cols-2 gap-y-1 text-sm">
            <div className="text-slate-500">Subtotal</div>
            <div className="text-right tabular-nums text-slate-900">{formatCurrency(totals.subtotal)}</div>
            <div className="text-slate-500">{taxLabel}</div>
            <div className="text-right tabular-nums text-slate-900">{formatCurrency(totals.taxAmount)}</div>
            <div className="border-t border-slate-200 pt-1 text-sm font-semibold text-slate-900">Total (incl. {taxLabel})</div>
            <div className="border-t border-slate-200 pt-1 text-right tabular-nums text-base font-semibold text-slate-900">{formatCurrency(totals.totalAmount)}</div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Payment Details" as="div">
            <RichTextEditor value={paymentDetails} onChange={setPaymentDetails} rows={4} placeholder="BSB / Account / Reference…" />
          </Field>
          <Field label="Internal Notes" hint="Not shown to customer">
            <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} className="min-h-[128px]" />
          </Field>
          <Field label="Terms" className="md:col-span-2">
            <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} className="min-h-0" />
          </Field>
        </div>
      </Card>
    </>
  );
}

function BodyItemDescriptionField({
  value, items, onChangeText, onPickItem, placeholder, disabled,
}: {
  value: string;
  items: Item[];
  onChangeText: (next: string) => void;
  onPickItem: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChangeText(e.target.value)}
        placeholder={placeholder}
        className="h-9 pr-9"
        disabled={disabled}
      />
      {items.length > 0 && !disabled ? (
        <DropdownMenuPrimitive.Root>
          <DropdownMenuPrimitive.Trigger
            type="button"
            aria-label="Pick item from catalogue"
            className="absolute inset-y-0 right-1 my-auto grid h-7 w-7 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </DropdownMenuPrimitive.Trigger>
          <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.Content
              align="end" sideOffset={4}
              className={cn(
                "z-50 min-w-[14rem] overflow-hidden rounded-[0.3rem] border border-slate-200 bg-white p-1 shadow-md",
                "data-[side=bottom]:animate-in data-[side=bottom]:fade-in-0 data-[side=bottom]:slide-in-from-top-1",
              )}
            >
              {items.map((it) => (
                <DropdownMenuPrimitive.Item
                  key={it.id}
                  onSelect={() => onPickItem(it.id)}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 text-sm text-slate-700 outline-none focus:bg-indigo-50 focus:text-indigo-700"
                >
                  <span className="truncate">{it.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">{formatCurrency(Number(it.unitPrice))}</span>
                </DropdownMenuPrimitive.Item>
              ))}
            </DropdownMenuPrimitive.Content>
          </DropdownMenuPrimitive.Portal>
        </DropdownMenuPrimitive.Root>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Refactor `frontend/components/invoices/invoice-form.tsx` to mount `<InvoiceBodyEditor>`.** Replace the existing Cards 2, 3, 4 JSX with a single `<InvoiceBodyEditor ... />` mount. The state declarations (`customerId`, `lines`, `paymentDetails`, etc.) stay where they are — they get passed down via props. Replace these sections from the current `InvoiceForm`:

Remove from `InvoiceForm`:
- The big `<Card>` with the 2-column grid containing "From / Customer / Address" on the left and "right column metadata" on the right. **Keep only the right column** (Invoice Number, Invoice Date, Due Date, PO Number, Status badge) — make it a card on its own.
- The entire `<Card className="overflow-hidden">` block containing line items.
- The entire `<Card className="p-6">` block containing Payment Details / Internal Notes / Terms.

Add in their place (between the right-column metadata card and the FormActions):

```tsx
<InvoiceBodyEditor
  customers={customers}
  items={items}
  taxTypes={taxTypes}
  customerId={customerId}
  setCustomerId={setCustomerId}
  invoiceDate={invoiceDate}
  dueDate={dueDate}
  lines={lines}
  setLines={setLines}
  paymentDetails={paymentDetails}
  setPaymentDetails={setPaymentDetails}
  internalNotes={internalNotes}
  setInternalNotes={setInternalNotes}
  terms={terms}
  setTerms={setTerms}
/>
```

Update the `Line` type and `blankLine` import: replace the local `Line` type with `BodyLine` from `invoice-body-editor.tsx`, and replace local `blankLine` with `blankBodyLine`. Replace the local `pickItem` / `pickTax` / `updateLine` / `totals` / `taxLabel` / `deriveTaxLabel` definitions inside `InvoiceForm` with the imports — those live in `InvoiceBodyEditor` now.

Imports to add at the top:

```tsx
import { InvoiceBodyEditor, blankBodyLine, type BodyLine } from "@/components/invoices/invoice-body-editor";
```

Imports to remove from `InvoiceForm` (no longer used in the parent):
- `RichTextEditor`, `RichTextView`, `Textarea` (still used elsewhere — only remove if truly unused)
- `Plus`, `Trash2`, `ChevronDown` from `lucide-react`
- `DropdownMenuPrimitive`
- `applyDynamicFields`
- `cn` (if only used in the body)
- `formatCurrency` (still used? check — keep if used in totals strip elsewhere)

The right-column metadata Card stays in `InvoiceForm` and renders as a full-width card now (no left column under it). The status badge layout from `LabeledRow` is unchanged.

- [ ] **Step 3: Rebuild frontend:**

```bash
docker compose build frontend && docker compose up -d frontend
sleep 8
```

- [ ] **Step 4: Verify the invoice edit form still works.** Navigate to `/invoices` and open the most recent invoice. Confirm:
  - The status badge still renders at the top right (3x size, rounded-[5px], rose for FAILED_TO_SEND etc.).
  - Customer dropdown still functions.
  - Line items grid renders identically — items combo, amount, tax dropdown, totals strip.
  - Payment Details, Internal Notes, Terms render in the footer card.
  - "Send Invoice" button appears for non-SENT invoices.
  - Save works (round-trip an edit).

```bash
# Quick sanity: confirm a list page still renders
curl -s http://localhost:3000/invoices/ 2>&1 | grep -o "<title>[^<]*</title>"
```

Expected: `<title>SimpleBooks</title>`. No browser-visible regressions when manually testing.

---

## Task 12: Recurring server pages (list + new + [id])

**Files:**
- Modify: `frontend/app/recurring/page.tsx`
- Create: `frontend/app/recurring/new/page.tsx`
- Create: `frontend/app/recurring/[id]/page.tsx`

All three pages fetch the data the form needs (customers, companies, items, taxTypes, schedules) and pass it through.

- [ ] **Step 1: Replace `frontend/app/recurring/page.tsx`:**

```tsx
import { api } from "@/lib/api";
import { RecurringList } from "@/components/recurring/recurring-list";
import type { RecurringRule, RecurringSchedule } from "@/lib/types";

async function load() {
  const [rules, schedules] = await Promise.all([
    api<RecurringRule[]>("/recurring").catch(() => [] as RecurringRule[]),
    api<RecurringSchedule[]>("/recurring-schedules").catch(() => [] as RecurringSchedule[]),
  ]);
  return { rules, schedules };
}

export default async function Page() {
  const { rules, schedules } = await load();
  return <RecurringList initial={rules} schedules={schedules} />;
}
```

- [ ] **Step 2: Create `frontend/app/recurring/new/page.tsx`:**

```tsx
import { api } from "@/lib/api";
import { PageShell } from "@/components/layout/page-shell";
import { RecurringForm } from "@/components/recurring/recurring-form";
import type {
  BillingCompany, Customer, Item, RecurringSchedule, TaxType,
} from "@/lib/types";

export default async function Page() {
  let customers: Customer[] = [];
  let companies: BillingCompany[] = [];
  let items: Item[] = [];
  let taxTypes: TaxType[] = [];
  let schedules: RecurringSchedule[] = [];
  try {
    [customers, companies, items, taxTypes, schedules] = await Promise.all([
      api<Customer[]>("/customers"),
      api<BillingCompany[]>("/companies"),
      api<Item[]>("/items"),
      api<TaxType[]>("/tax-types"),
      api<RecurringSchedule[]>("/recurring-schedules"),
    ]);
  } catch {}
  return (
    <PageShell title="New recurring invoice">
      <RecurringForm
        customers={customers}
        companies={companies}
        items={items}
        taxTypes={taxTypes}
        schedules={schedules}
      />
    </PageShell>
  );
}
```

- [ ] **Step 3: Create `frontend/app/recurring/[id]/page.tsx`:**

```tsx
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { PageShell } from "@/components/layout/page-shell";
import { RecurringForm } from "@/components/recurring/recurring-form";
import type {
  BillingCompany, Customer, Item, RecurringRule, RecurringSchedule, TaxType,
} from "@/lib/types";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let rule: RecurringRule;
  let customers: Customer[] = [];
  let companies: BillingCompany[] = [];
  let items: Item[] = [];
  let taxTypes: TaxType[] = [];
  let schedules: RecurringSchedule[] = [];
  try {
    [rule, customers, companies, items, taxTypes, schedules] = await Promise.all([
      api<RecurringRule>(`/recurring/${id}`),
      api<Customer[]>("/customers"),
      api<BillingCompany[]>("/companies"),
      api<Item[]>("/items"),
      api<TaxType[]>("/tax-types"),
      api<RecurringSchedule[]>("/recurring-schedules"),
    ]);
  } catch {
    notFound();
  }
  return (
    <PageShell title={`Recurring · ${rule!.scheduleName}`}>
      <RecurringForm
        initial={rule!}
        customers={customers}
        companies={companies}
        items={items}
        taxTypes={taxTypes}
        schedules={schedules}
      />
    </PageShell>
  );
}
```

---

## Task 13: Recurring list rebuild

**Files:**
- Replace: `frontend/components/recurring/recurring-list.tsx`

Same `<FilteredList>` pattern the other list pages use. Search by Schedule Name + Customer; filter by Recurring Schedule + Sending Option + Active. Default sort: Active first, then Schedule Name asc.

- [ ] **Step 1: Replace the file contents:**

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import {
  FilteredList,
  textIncludes,
  selectMatches,
  type FilterFieldDef,
} from "@/components/data/filtered-list";
import type { Column } from "@/components/data/list-table";
import {
  SENDING_OPTIONS,
  type RecurringRule,
  type RecurringSchedule,
} from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";

const SENDING_LABEL = Object.fromEntries(SENDING_OPTIONS.map((s) => [s.value, s.label]));

const columns: Column<RecurringRule>[] = [
  {
    key: "name",
    label: "Schedule Name",
    render: (r) => <span className="font-medium text-slate-900">{r.scheduleName}</span>,
    width: "2fr",
    sortValue: (r) => r.scheduleName,
  },
  {
    key: "customer",
    label: "Customer",
    render: (r) => <span className="text-slate-700">{r.customer?.name ?? "—"}</span>,
    width: "1.5fr",
    sortValue: (r) => r.customer?.name ?? "",
  },
  {
    key: "schedule",
    label: "Recurring Schedule",
    render: (r) => <span className="text-slate-700">{r.recurringSchedule?.name ?? "—"}</span>,
    width: "150px",
    sortValue: (r) => r.recurringSchedule?.name ?? "",
  },
  {
    key: "next",
    label: "Next Run",
    render: (r) => <span className="text-slate-600 tabular-nums">{formatDate(r.nextRunAt)}</span>,
    width: "120px",
    sortValue: (r) => new Date(r.nextRunAt),
  },
  {
    key: "amount",
    label: "Amount",
    align: "right",
    render: (r) => formatCurrency((r.lineItems ?? []).reduce((s, l) => s + Number(l.unitPrice || 0), 0)),
    width: "120px",
    sortValue: (r) => (r.lineItems ?? []).reduce((s, l) => s + Number(l.unitPrice || 0), 0),
  },
  {
    key: "sending",
    label: "Sending",
    render: (r) => <span className="text-slate-600">{SENDING_LABEL[r.sendingOption]}</span>,
    width: "180px",
    sortValue: (r) => SENDING_LABEL[r.sendingOption],
  },
  {
    key: "active",
    label: "Active",
    render: (r) => (
      <Badge tone={r.active ? "completed" : "cancelled"}>{r.active ? "Active" : "Paused"}</Badge>
    ),
    width: "100px",
    sortValue: (r) => r.active,
  },
];

export function RecurringList({
  initial,
  schedules,
}: {
  initial: RecurringRule[];
  schedules: RecurringSchedule[];
}) {
  const filterFields: FilterFieldDef[] = [
    { key: "name", label: "Schedule Name", type: "text", placeholder: "Search by schedule name…" },
    { key: "customer", label: "Customer", type: "text", placeholder: "Search by customer…" },
    {
      key: "schedule",
      label: "Recurring Schedule",
      type: "select",
      options: schedules.map((s) => ({ value: s.id, label: s.name })),
    },
    { key: "sending", label: "Sending Option", type: "select", options: SENDING_OPTIONS },
    {
      key: "active",
      label: "Active",
      type: "select",
      options: [
        { value: "true", label: "Active" },
        { value: "false", label: "Paused" },
      ],
    },
  ];

  return (
    <FilteredList<RecurringRule>
      title="Recurring Invoices"
      rows={initial}
      columns={columns}
      rowHref={(r) => `/recurring/${r.id}`}
      newHref="/recurring/new"
      newLabel="New recurring invoice"
      emptyMessage="No recurring invoices yet."
      filterFields={filterFields}
      filterFn={(r, v) =>
        textIncludes(r.scheduleName, v.name ?? "") &&
        textIncludes(r.customer?.name, v.customer ?? "") &&
        selectMatches(r.recurringScheduleId ?? null, v.schedule ?? "") &&
        selectMatches(r.sendingOption, v.sending ?? "") &&
        selectMatches(r.active ? "true" : "false", v.active ?? "")
      }
      defaultSort={{ key: "active", direction: "desc" }}
      tieBreakerKey="name"
    />
  );
}
```

- [ ] **Step 2: Rebuild frontend and verify the list page renders:**

```bash
docker compose build frontend && docker compose up -d frontend
sleep 8
```

Navigate to `http://localhost:3000/recurring`. Expected: 7 columns visible, the seeded `Alex Kurm - Every month` rule + any sweep-generated rules show in the table. Filter button opens the panel; all 5 filter fields render.

---

## Task 14: `<RecurringForm>` — edit form

**Files:**
- Create: `frontend/components/recurring/recurring-form.tsx`

Mounts the "Recurring Settings" top card (Schedule Name read-only + Start Date + Recurring Schedule + Sending Options + Active + PO Number) and then `<InvoiceBodyEditor>` for everything else.

- [ ] **Step 1: Create the file:**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormActions } from "@/components/data/form-actions";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/api-errors";
import {
  SENDING_OPTIONS,
  type BillingCompany,
  type Customer,
  type Item,
  type RecurringRule,
  type RecurringSchedule,
  type SendingOption,
  type TaxType,
} from "@/lib/types";
import {
  InvoiceBodyEditor,
  blankBodyLine,
  type BodyLine,
} from "@/components/invoices/invoice-body-editor";

function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function toIsoDate(d?: string | null) {
  if (!d) return "";
  return localIsoDate(new Date(d));
}
function todayIso(): string {
  return localIsoDate(new Date());
}

export function RecurringForm({
  initial,
  customers,
  items,
  taxTypes,
  schedules,
}: {
  initial?: RecurringRule;
  customers: Customer[];
  // companies prop accepted but not consumed directly — billing company is
  // derived from the selected customer (same pattern as InvoiceForm).
  companies?: BillingCompany[];
  items: Item[];
  taxTypes: TaxType[];
  schedules: RecurringSchedule[];
}) {
  const router = useRouter();
  const activeTaxTypes = useMemo(() => taxTypes.filter((t) => t.isActive), [taxTypes]);
  const defaultTax = activeTaxTypes[0] ?? null;
  const activeSchedules = useMemo(() => schedules.filter((s) => s.isActive), [schedules]);

  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [startDate, setStartDate] = useState(toIsoDate(initial?.startDate) || todayIso());
  const [recurringScheduleId, setRecurringScheduleId] = useState(initial?.recurringScheduleId ?? "");
  const [sendingOption, setSendingOption] = useState<SendingOption>(initial?.sendingOption ?? "REVIEW_BEFORE_SENDING");
  const [active, setActive] = useState(initial?.active ?? true);
  const [poNumber, setPoNumber] = useState(initial?.poNumber ?? "");
  const [paymentDetails, setPaymentDetails] = useState(initial?.paymentDetails ?? "");
  const [internalNotes, setInternalNotes] = useState(initial?.internalNotes ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? "");
  const [lines, setLines] = useState<BodyLine[]>(
    initial?.lineItems?.length
      ? initial.lineItems.map((l) => {
          const matched =
            (l.taxTypeId ? taxTypes.find((t) => t.id === l.taxTypeId) : null) ??
            (l.taxName
              ? taxTypes.find((t) => t.name === l.taxName && Number(t.rate) === (l.taxRate != null ? Number(l.taxRate) : 0))
              : null) ??
            null;
          return {
            itemId: l.itemId ?? "",
            description: l.description,
            amount: String(l.unitPrice),
            taxTypeId: matched?.id ?? "",
            taxName: matched?.name ?? l.taxName ?? "",
            taxRate: matched ? String(matched.rate) : l.taxRate != null ? String(l.taxRate) : "",
          };
        })
      : [blankBodyLine(defaultTax)],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived Schedule Name — re-runs whenever customer or schedule changes.
  const scheduleName = useMemo(() => {
    const c = customers.find((x) => x.id === customerId)?.name;
    const s = schedules.find((x) => x.id === recurringScheduleId)?.name;
    if (!c || !s) return "";
    return `${c} - ${s}`;
  }, [customers, customerId, schedules, recurringScheduleId]);

  // Save validation: customer + schedule + startDate + ≥1 line with a non-empty description.
  const canSave =
    !!customerId &&
    !!recurringScheduleId &&
    !!startDate &&
    lines.some((l) => l.description.trim().length > 0);

  // For the body editor's auto due-date-display only — we don't store dueDate
  // on the rule, but the body uses {{due date}} substitution at item-pick
  // time. Compute a preview dueDate from the customer's payment terms so the
  // item-picker substitution shows something sensible while editing.
  const dueDatePreview = useMemo(() => {
    if (!startDate) return "";
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return "";
    const offset =
      customer.paymentTerms === "IN_28_DAYS" ? 27 :
      customer.paymentTerms === "IN_15_DAYS" ? 14 :
      customer.paymentTerms === "IN_7_DAYS"  ? 6  :
      0;
    const d = new Date(startDate + "T00:00:00");
    d.setDate(d.getDate() + offset);
    return localIsoDate(d);
  }, [startDate, customers, customerId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSave) return;
    setSaving(true);
    const payload = {
      startDate: new Date(startDate).toISOString(),
      recurringScheduleId,
      sendingOption,
      active,
      customerId,
      poNumber: poNumber || undefined,
      paymentDetails: paymentDetails || undefined,
      internalNotes: internalNotes || undefined,
      terms: terms || undefined,
      lineItems: lines.map((l) => ({
        itemId: l.itemId || undefined,
        description: l.description,
        unitPrice: Number(l.amount) || 0,
        taxTypeId: l.taxTypeId || undefined,
        taxName: l.taxName || undefined,
        taxRate: l.taxRate ? Number(l.taxRate) : undefined,
      })),
    };
    try {
      if (initial) await apiClient.patch(`/recurring/${initial.id}`, payload);
      else await apiClient.post("/recurring", payload);
      router.push("/recurring");
      router.refresh();
    } catch (e: any) {
      setError(parseApiError(e?.message));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial || !confirm("Delete this recurring invoice?")) return;
    setError(null);
    try {
      await apiClient.delete(`/recurring/${initial.id}`);
      router.push("/recurring");
      router.refresh();
    } catch (e: any) {
      setError(parseApiError(e?.message));
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Card className="p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Schedule Name">
            <Input value={scheduleName} disabled placeholder="Auto-derived from customer + schedule" />
          </Field>
          <Field label="Start Date" required>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>

          <Field label="Recurring Schedule" required>
            <Select value={recurringScheduleId || "__none__"} onValueChange={(v) => setRecurringScheduleId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {activeSchedules.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Sending Options" required>
            <Select value={sendingOption} onValueChange={(v) => setSendingOption(v as SendingOption)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SENDING_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Active">
            <div className="flex h-9 items-center">
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </Field>
          <Field label="PO Number">
            <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
          </Field>
        </div>
      </Card>

      <InvoiceBodyEditor
        customers={customers}
        items={items}
        taxTypes={taxTypes}
        customerId={customerId}
        setCustomerId={setCustomerId}
        invoiceDate={startDate}
        dueDate={dueDatePreview}
        lines={lines}
        setLines={setLines}
        paymentDetails={paymentDetails}
        setPaymentDetails={setPaymentDetails}
        internalNotes={internalNotes}
        setInternalNotes={setInternalNotes}
        terms={terms}
        setTerms={setTerms}
      />

      {error ? <p className="text-xs text-rose-600" role="alert">{error}</p> : null}
      <FormActions
        saving={saving || !canSave}
        onDelete={initial ? remove : undefined}
        cancelHref="/recurring"
      />
    </form>
  );
}
```

- [ ] **Step 2: Rebuild frontend:**

```bash
docker compose build frontend && docker compose up -d frontend
sleep 8
```

- [ ] **Step 3: Verify in browser.** Navigate to `/recurring`, click the seeded rule, confirm:
  - Schedule Name displays auto-derived (`Alex Kurm - Every month`).
  - Start Date / Recurring Schedule / Sending Options / Active / PO Number populated.
  - InvoiceBodyEditor renders with customer "From" block, line items with the seeded line, totals strip.
  - Save button is enabled (all required fields present).
  - Clear the customer → Save button disables, amber banner appears on line items.

Also test `/recurring/new`:
  - Save button disabled until customer + schedule + start date + at least one line description are filled.
  - Pick a customer with a billing company that has Custom SMTP set → "From" block updates; Payment Details auto-populates.
  - Save → new rule appears in `/recurring` list.

---

## Task 15: Settings — RecurringSchedules manager + sidebar entry

**Files:**
- Create: `frontend/components/settings/recurring-schedules-manager.tsx`
- Create: `frontend/app/settings/recurring-schedules/page.tsx`
- Modify: `frontend/components/settings/settings-nav.tsx`

Tax-types-manager pattern: list table + create/edit dialog + delete.

- [ ] **Step 1: Create `frontend/components/settings/recurring-schedules-manager.tsx`:**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { SectionHeader } from "./section-header";
import { apiClient } from "@/lib/api";
import {
  RECURRING_INTERVAL_UNITS,
  type RecurringIntervalUnit,
  type RecurringSchedule,
} from "@/lib/types";

export function RecurringSchedulesManager({ initial }: { initial: RecurringSchedule[] }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringSchedule | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<RecurringIntervalUnit>("MONTHS");
  const [count, setCount] = useState("1");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setName("");
    setUnit("MONTHS");
    setCount("1");
    setIsActive(true);
    setError(null);
    setOpen(true);
  }
  function openEdit(row: RecurringSchedule) {
    setEditing(row);
    setName(row.name);
    setUnit(row.intervalUnit);
    setCount(String(row.intervalCount));
    setIsActive(row.isActive);
    setError(null);
    setOpen(true);
  }
  function close() { setOpen(false); setError(null); }

  async function refresh() {
    setRows(await apiClient.get<RecurringSchedule[]>("/recurring-schedules"));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = { name, intervalUnit: unit, intervalCount: Number(count) || 1, isActive };
    try {
      if (editing) await apiClient.patch(`/recurring-schedules/${editing.id}`, payload);
      else await apiClient.post("/recurring-schedules", payload);
      close();
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Save failed.");
    }
  }

  async function remove(row: RecurringSchedule) {
    if (!confirm(`Delete schedule "${row.name}"?`)) return;
    await apiClient.delete(`/recurring-schedules/${row.id}`);
    await refresh();
  }

  // Sort: active first, then name asc.
  const sorted = [...rows].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <SectionHeader
        title="Recurring Schedules"
        description="Catalog of interval definitions. Used by recurring invoice templates."
      />
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-end">
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New schedule
          </Button>
        </div>
        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left">Interval</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 text-slate-900">{row.name}</td>
                  <td className="px-4 py-2 text-slate-700">
                    Every {row.intervalCount} {row.intervalUnit.toLowerCase()}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={row.isActive ? "completed" : "cancelled"}>
                      {row.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(row)}
                      className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit schedule" : "New schedule"}</DialogTitle>
            <DialogDescription>
              Defines how often a recurring invoice generates. Used as the right-hand side of
              "Every &lt;count&gt; &lt;unit&gt;".
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Interval Count" required>
                <Input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} required />
              </Field>
              <Field label="Interval Unit" required>
                <Select value={unit} onValueChange={(v) => setUnit(v as RecurringIntervalUnit)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRING_INTERVAL_UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Active">
              <div className="flex h-9 items-center">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </Field>
            {error ? <p className="text-xs text-rose-600" role="alert">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
              <Button type="submit">{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/app/settings/recurring-schedules/page.tsx`:**

```tsx
import { api } from "@/lib/api";
import { RecurringSchedulesManager } from "@/components/settings/recurring-schedules-manager";
import type { RecurringSchedule } from "@/lib/types";

export default async function Page() {
  let rows: RecurringSchedule[] = [];
  try { rows = await api<RecurringSchedule[]>("/recurring-schedules"); } catch {}
  return <RecurringSchedulesManager initial={rows} />;
}
```

- [ ] **Step 3: Add the sidebar entry. Open `frontend/components/settings/settings-nav.tsx`. Find the existing `sections` array and add the new entry between Tax Types and Dynamic Fields:**

```tsx
import {
  // ...existing imports...
  Repeat,
} from "@phosphor-icons/react";
```

```tsx
export const sections: SettingsSection[] = [
  { href: "/settings/preferences", label: "Preferences", icon: GearSix },
  { href: "/settings/roles", label: "Roles", icon: ShieldCheck },
  { href: "/settings/tax-types", label: "Tax Types", icon: Percent },
  { href: "/settings/recurring-schedules", label: "Recurring Schedules", icon: Repeat },
  { href: "/settings/dynamic-fields", label: "Dynamic Fields", icon: BracketsCurly },
  { href: "/settings/invoice-templates", label: "Invoice Templates", icon: FileText },
  { href: "/settings/email-templates", label: "Email Templates", icon: Envelope },
  { href: "/settings/mail-configuration", label: "Mail Configuration", icon: EnvelopeSimple },
  { href: "/settings/users", label: "Users", icon: Users },
  { href: "/settings/telegram", label: "Telegram", icon: PaperPlaneTilt },
];
```

- [ ] **Step 4: Rebuild and verify:**

```bash
docker compose build frontend && docker compose up -d frontend
sleep 8
```

Navigate to `/settings/recurring-schedules`. Expected:
- "Recurring Schedules" entry in the settings sidebar (with Repeat icon).
- Table lists all 6 seeded schedules sorted alphabetically.
- "+ New schedule" button opens a dialog.
- Edit / delete buttons work; the list refreshes after each action.

---

## Task 16: Documentation updates + end-to-end verification

**Files:**
- Modify: `modules_and_logic.md`
- Modify: `DatabaseSchema.md`
- Modify: `Architecture.md`
- Modify: `DesignSystem.md`

Per the project convention, the four sibling docs are audited; this is the last task and it's mandatory.

- [ ] **Step 1: Update `modules_and_logic.md`.** Find the existing "Recurring Invoices" section. Replace it with the full Section 3.2 content from the spec at `docs/superpowers/specs/2026-05-18-recurring-invoices-design.md`. The new section should document:
  - Fields table (matching §2.2 of the spec).
  - List page columns / filters / default sort (§3.1).
  - Edit page layout (Card 1 + cards 2-4 via InvoiceBodyEditor; §3.2).
  - Save validation rules (§3.3).
  - Customer-required gate (§3.4).
  - Generation processor behavior (one-invoice-per-rule-per-sweep, dynamic field substitution, payment-term-based due date, SEND_DIRECTLY routes through InvoiceMailService.send) — §4.
  - Cross-references to Dynamic Fields page.

Also add a new "Recurring Schedules" subsection under Settings (mirror Tax Types' shape).

- [ ] **Step 2: Update `DatabaseSchema.md`.** Replace the existing `RecurringRule` row entirely with the new shape. Add new rows for `RecurringSchedule` and `RecurringRuleLineItem`. Add `RecurringIntervalUnit` and `SendingOption` to the enum table. Remove `RecurringFrequency`. Document `InvoiceStatus.FAILED_TO_SEND` + the `Invoice.sendError` / `sendAttempts` / `lastSendAt` columns added during the SMTP feature.

- [ ] **Step 3: Update `Architecture.md`.** Under "Background jobs" add the existing `invoice-mail` queue (4 attempts × 10-min fixed backoff). Document the new `RESEND_API_KEY` and `RESEND_FROM` env vars. Add to "Known operational caveats" the non-additive RecurringRule replacement: "Migrating to the new recurring-invoices schema (May 2026) requires `docker compose down -v` once. The old `RecurringRule` shape (`name`, `amount`, `frequency`, `nextRunAt`) cannot be coerced into the new `RecurringRule` (`startDate`, `recurringScheduleId`, `sendingOption`, etc.) automatically — `prisma db push` will refuse the migration. Wipe the volume; the seed repopulates."

- [ ] **Step 4: Update `DesignSystem.md`.** Find the Badge color table and add a row for `FAILED_TO_SEND` (reuses the existing `overdue` rose tone — rose-50 background, rose-700 text).

- [ ] **Step 5: End-to-end smoke test.** Run through the recurring flow start-to-finish:

```bash
# Force the sweep to fire now
docker exec simplebooks-postgres-1 psql -U postgres -d simplebooks -c \
  "UPDATE \"RecurringRule\" SET \"nextRunAt\" = NOW() - INTERVAL '1 day';"
sleep 70

# Confirm a new invoice was generated with resolved dynamic fields
docker exec simplebooks-postgres-1 psql -U postgres -d simplebooks -c \
  "SELECT i.\"invoiceNumber\", ii.description FROM \"Invoice\" i JOIN \"InvoiceItem\" ii ON ii.\"invoiceId\" = i.id WHERE i.\"recurringRuleId\" IS NOT NULL ORDER BY i.\"invoiceNumber\" DESC LIMIT 5;"
```

Expected: The most recent generated invoice has a line description like `Monthly retainer for May-2026` (with the actual current month-year, not `{{month-year}}`).

```bash
# Confirm the rule's nextRunAt advanced by one month
docker exec simplebooks-postgres-1 psql -U postgres -d simplebooks -c \
  "SELECT \"scheduleName\", \"nextRunAt\" FROM \"RecurringRule\";"
```

Expected: nextRunAt is ~30 days in the future.

Manual browser checks:
- Open `/recurring` → seeded rule + any generated runs visible.
- Open the rule → edit, change the line description, save → verify update via DB.
- Create a new rule via `/recurring/new` for a different customer → save → appears in list.
- Customer-delete protection: try to delete a customer that has a recurring rule pointing at them → expect the inline 409 error rendered by the customer-edit form.

- [ ] **Step 6: Verify documentation consistency.** Open the four sibling docs and the spec doc side-by-side. Confirm:
  - `DatabaseSchema.md` lists every column from `schema.prisma` for the three new/replaced tables.
  - `modules_and_logic.md` has no "Not yet built" notes in the Recurring Invoices section.
  - `Architecture.md` mentions both the `recurring-invoices` and `invoice-mail` BullMQ queues.
  - `DesignSystem.md` shows the FAILED_TO_SEND badge tone.

---

## Self-review checklist (for the implementer)

After finishing all 16 tasks:

1. **Spec coverage:** Each acceptance criterion in §8 of the spec maps to verification steps in the tasks above. Re-read §8 and confirm each item passes.
2. **Volume integrity:** The seed should be idempotent on a fresh `down -v` — confirm by wiping and booting once more. The 6 schedules + sample rule should always come back.
3. **Pipeline reuse:** SEND_DIRECTLY in the recurring processor calls `InvoiceMailService.send` (Task 8). The retry / FAILED_TO_SEND / notification machinery is the same one the manual "Send Invoice" button uses — no duplicate code.
4. **No-test-suite caveat:** This plan verifies via curl + Playwright + psql. If the project later adopts a Jest/Vitest harness, add unit tests for the date-math helpers (`addMonths`, `paymentTermsOffsetDays`, `advanceNextRun`) and integration tests for the processor.
