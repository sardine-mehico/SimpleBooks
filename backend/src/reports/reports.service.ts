// backend/src/reports/reports.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportQueryDto, TagsReportQueryDto } from './dto';
import { localStartOfDay, localEndOfDay } from '../util/dates';

export type ReportKind = 'EXPENSE' | 'INCOME';

export interface ReportChildRow {
  id: string;
  name: string;
  total: string;
}

export interface ReportParentRow {
  id: string;
  name: string;
  total: string;
  children: ReportChildRow[];
}

export interface ReportResponse {
  kind: ReportKind;
  from: string;
  to: string;
  accountIds: string[] | null;
  tagIds: string[] | null;
  parents: ReportParentRow[];
  uncategorised: string;
  grandTotal: string;
}

export interface TagsReportRow {
  id: string;
  name: string;
  color: string | null;
  total: string;
  count: number;
}

export interface TagsReportResponse {
  kind: ReportKind;
  from: string;
  to: string;
  accountIds: string[] | null;
  dedupTotal: string;       // sum of transactions matching filters, counted once each
  dedupCount: number;       // distinct transaction count
  untaggedTotal: string;    // dedup total over transactions with NO tags
  untaggedCount: number;
  taggedTotal: string;      // dedup total over transactions with >=1 tag (== dedupTotal - untaggedTotal)
  taggedCount: number;
  tags: TagsReportRow[];    // per-tag totals; a transaction with N tags appears in N rows
  sumOfTagTotals: string;   // SUM(tags[].total)
  overlapTotal: string;     // sumOfTagTotals - taggedTotal (>= 0 by construction)
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getReport(kind: ReportKind, q: ReportQueryDto): Promise<ReportResponse> {
    const accountIds = parseAccountIds(q.accountIds);
    const tagIds = parseAccountIds(q.tagIds); // same UUID-CSV parser

    if (accountIds !== null && accountIds.length === 0) {
      return { kind, from: q.from, to: q.to, accountIds: [], tagIds, parents: [], uncategorised: '0.00', grandTotal: '0.00' };
    }
    if (tagIds !== null && tagIds.length === 0) {
      return { kind, from: q.from, to: q.to, accountIds, tagIds: [], parents: [], uncategorised: '0.00', grandTotal: '0.00' };
    }

    const prefs = await this.prisma.preferences.findFirst();
    const timezone = prefs?.timezone ?? 'Australia/Perth';
    const fromDate = localStartOfDay(q.from, timezone);
    const toDate = localEndOfDay(q.to, timezone);

    const signPredicate = kind === 'EXPENSE'
      ? Prisma.sql`t."amount" < 0`
      : Prisma.sql`t."amount" > 0`;
    const sumExpr = Prisma.sql`SUM(CASE WHEN ${signPredicate} THEN ABS(t."amount") ELSE 0 END)`;

    const accountFilter = accountIds && accountIds.length > 0
      ? Prisma.sql`AND t."accountId" = ANY(${accountIds}::text[])`
      : Prisma.empty;

    const tagFilter = tagIds && tagIds.length > 0
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM "TransactionTag" tt
          WHERE tt."transactionId" = t."id"
            AND tt."tagId" = ANY(${tagIds}::text[])
        )`
      : Prisma.empty;

    type CatRow = {
      rollupId: string;
      leafId: string;
      leafName: string;
      parentName: string | null;
      total: Prisma.Decimal | string;
    };

    const rows: CatRow[] = await this.prisma.$queryRaw<CatRow[]>(Prisma.sql`
      SELECT
        COALESCE(c."parentId", c."id") AS "rollupId",
        c."id" AS "leafId",
        c."name" AS "leafName",
        p."name" AS "parentName",
        ${sumExpr} AS "total"
      FROM "Transaction" t
      JOIN "Category" c ON c."id" = t."categoryId"
      LEFT JOIN "Category" p ON p."id" = c."parentId"
      WHERE t."date" BETWEEN ${fromDate} AND ${toDate}
        AND c."kind" = ${kind}::"CategoryKind"
        ${accountFilter}
        ${tagFilter}
      GROUP BY COALESCE(c."parentId", c."id"), c."id", c."name", p."name"
      HAVING ${sumExpr} > 0
    `);

    const byRollup = new Map<string, { id: string; name: string; total: number; children: ReportChildRow[] }>();
    for (const r of rows) {
      const isStandaloneLeaf = r.rollupId === r.leafId;
      let slot = byRollup.get(r.rollupId);
      if (!slot) {
        const groupName = isStandaloneLeaf ? r.leafName : (r.parentName ?? r.leafName);
        slot = { id: r.rollupId, name: groupName, total: 0, children: [] };
        byRollup.set(r.rollupId, slot);
      }
      slot.total += Number(r.total);
      if (!isStandaloneLeaf) {
        slot.children.push({ id: r.leafId, name: r.leafName, total: Number(r.total).toFixed(2) });
      }
    }

    const parents: ReportParentRow[] = Array.from(byRollup.values())
      .map((g) => ({
        id: g.id,
        name: g.name,
        total: g.total.toFixed(2),
        children: g.children.slice().sort((a, b) => Number(b.total) - Number(a.total)),
      }))
      .sort((a, b) => Number(b.total) - Number(a.total));

    const uncatRows: Array<{ total: Prisma.Decimal | string }> = await this.prisma.$queryRaw(Prisma.sql`
      SELECT COALESCE(${sumExpr}, 0) AS "total"
      FROM "Transaction" t
      WHERE t."categoryId" IS NULL
        AND t."date" BETWEEN ${fromDate} AND ${toDate}
        ${accountFilter}
        ${tagFilter}
    `);
    const uncategorised = Number(uncatRows[0]?.total ?? 0).toFixed(2);
    const grandTotal = (Number(uncategorised) + parents.reduce((acc, p) => acc + Number(p.total), 0)).toFixed(2);

    return {
      kind, from: q.from, to: q.to, accountIds, tagIds,
      parents, uncategorised, grandTotal,
    };
  }

  async getTagsReport(q: TagsReportQueryDto): Promise<TagsReportResponse> {
    const kind = q.kind === 'INCOME' ? 'INCOME' as const : 'EXPENSE' as const;
    const accountIds = parseAccountIds(q.accountIds);

    if (accountIds !== null && accountIds.length === 0) {
      return {
        kind, from: q.from, to: q.to, accountIds: [],
        dedupTotal: '0.00', dedupCount: 0,
        untaggedTotal: '0.00', untaggedCount: 0,
        taggedTotal: '0.00', taggedCount: 0,
        tags: [], sumOfTagTotals: '0.00', overlapTotal: '0.00',
      };
    }

    const prefs = await this.prisma.preferences.findFirst();
    const timezone = prefs?.timezone ?? 'Australia/Perth';
    const fromDate = localStartOfDay(q.from, timezone);
    const toDate = localEndOfDay(q.to, timezone);

    // For tags report we DON'T inner-join Category — a tagged transaction
    // counts whether or not the user has categorised it. The kind filter is
    // applied via amount sign only (EXPENSE => amount<0, INCOME => amount>0).
    const signPredicate = kind === 'EXPENSE'
      ? Prisma.sql`t."amount" < 0`
      : Prisma.sql`t."amount" > 0`;

    const accountFilter = accountIds && accountIds.length > 0
      ? Prisma.sql`AND t."accountId" = ANY(${accountIds}::text[])`
      : Prisma.empty;

    // Dedup total + count
    const dedupRows: Array<{ total: Prisma.Decimal | string | null; count: bigint | number }> = await this.prisma.$queryRaw(Prisma.sql`
      SELECT
        COALESCE(SUM(ABS(t."amount")), 0) AS "total",
        COUNT(*) AS "count"
      FROM "Transaction" t
      WHERE ${signPredicate}
        AND t."date" BETWEEN ${fromDate} AND ${toDate}
        ${accountFilter}
    `);
    const dedupTotalNum = Number(dedupRows[0]?.total ?? 0);
    const dedupCount = Number(dedupRows[0]?.count ?? 0);

    // Untagged total + count
    const untaggedRows: Array<{ total: Prisma.Decimal | string | null; count: bigint | number }> = await this.prisma.$queryRaw(Prisma.sql`
      SELECT
        COALESCE(SUM(ABS(t."amount")), 0) AS "total",
        COUNT(*) AS "count"
      FROM "Transaction" t
      WHERE ${signPredicate}
        AND t."date" BETWEEN ${fromDate} AND ${toDate}
        ${accountFilter}
        AND NOT EXISTS (
          SELECT 1 FROM "TransactionTag" tt WHERE tt."transactionId" = t."id"
        )
    `);
    const untaggedTotalNum = Number(untaggedRows[0]?.total ?? 0);
    const untaggedCount = Number(untaggedRows[0]?.count ?? 0);
    const taggedTotalNum = dedupTotalNum - untaggedTotalNum;
    const taggedCount = dedupCount - untaggedCount;

    // Per-tag totals (a transaction with N tags contributes its full amount to N rows).
    const tagRows: Array<{ id: string; name: string; color: string | null; total: Prisma.Decimal | string | null; count: bigint | number }> = await this.prisma.$queryRaw(Prisma.sql`
      SELECT
        tag."id" AS "id",
        tag."name" AS "name",
        tag."color" AS "color",
        COALESCE(SUM(ABS(t."amount")), 0) AS "total",
        COUNT(*) AS "count"
      FROM "Transaction" t
      JOIN "TransactionTag" tt ON tt."transactionId" = t."id"
      JOIN "Tag" tag ON tag."id" = tt."tagId"
      WHERE ${signPredicate}
        AND t."date" BETWEEN ${fromDate} AND ${toDate}
        ${accountFilter}
      GROUP BY tag."id", tag."name", tag."color"
      HAVING COALESCE(SUM(ABS(t."amount")), 0) > 0
      ORDER BY "total" DESC
    `);

    const tags: TagsReportRow[] = tagRows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color ?? null,
      total: Number(r.total ?? 0).toFixed(2),
      count: Number(r.count ?? 0),
    }));
    const sumOfTagTotalsNum = tags.reduce((acc, t) => acc + Number(t.total), 0);
    const overlapTotalNum = Math.max(sumOfTagTotalsNum - taggedTotalNum, 0);

    return {
      kind, from: q.from, to: q.to, accountIds,
      dedupTotal: dedupTotalNum.toFixed(2),
      dedupCount,
      untaggedTotal: untaggedTotalNum.toFixed(2),
      untaggedCount,
      taggedTotal: taggedTotalNum.toFixed(2),
      taggedCount,
      tags,
      sumOfTagTotals: sumOfTagTotalsNum.toFixed(2),
      overlapTotal: overlapTotalNum.toFixed(2),
    };
  }
}

function parseAccountIds(raw?: string): string[] | null {
  if (raw === undefined) return null;
  if (raw === '') return [];
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p)) {
      throw new Error(`Invalid uuid: ${p}`);
    }
  }
  return parts;
}
