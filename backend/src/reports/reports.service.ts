// backend/src/reports/reports.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportQueryDto } from './dto';
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
  parents: ReportParentRow[];
  uncategorised: string;
  grandTotal: string;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getReport(kind: ReportKind, q: ReportQueryDto): Promise<ReportResponse> {
    const accountIds = parseAccountIds(q.accountIds);

    // Caller passed an empty list explicitly (e.g. ?accountIds=) → zero-state.
    if (accountIds !== null && accountIds.length === 0) {
      return { kind, from: q.from, to: q.to, accountIds: [], parents: [], uncategorised: '0.00', grandTotal: '0.00' };
    }

    const prefs = await this.prisma.preferences.findFirst();
    const timezone = prefs?.timezone ?? 'Australia/Perth';
    const fromDate = localStartOfDay(q.from, timezone);
    const toDate = localEndOfDay(q.to, timezone);

    // Sign predicate: expense uses negative transaction amounts; income uses positive.
    const signPredicate = kind === 'EXPENSE'
      ? Prisma.sql`t."amount" < 0`
      : Prisma.sql`t."amount" > 0`;
    const sumExpr = Prisma.sql`SUM(CASE WHEN ${signPredicate} THEN ABS(t."amount") ELSE 0 END)`;

    // Account filter fragment.
    const accountFilter = accountIds && accountIds.length > 0
      ? Prisma.sql`AND t."accountId" = ANY(${accountIds}::uuid[])`
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
      GROUP BY COALESCE(c."parentId", c."id"), c."id", c."name", p."name"
      HAVING ${sumExpr} > 0
    `);

    // Group flat rows by rollupId to build parents + children.
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

    // Sort: parents by total desc; children within each parent by total desc.
    const parents: ReportParentRow[] = Array.from(byRollup.values())
      .map((g) => ({
        id: g.id,
        name: g.name,
        total: g.total.toFixed(2),
        children: g.children.slice().sort((a, b) => Number(b.total) - Number(a.total)),
      }))
      .sort((a, b) => Number(b.total) - Number(a.total));

    // Uncategorised total.
    const uncatRows: Array<{ total: Prisma.Decimal | string }> = await this.prisma.$queryRaw(Prisma.sql`
      SELECT COALESCE(${sumExpr}, 0) AS "total"
      FROM "Transaction" t
      WHERE t."categoryId" IS NULL
        AND t."date" BETWEEN ${fromDate} AND ${toDate}
        ${accountFilter}
    `);
    const uncategorised = Number(uncatRows[0]?.total ?? 0).toFixed(2);
    const grandTotal = (Number(uncategorised) + parents.reduce((acc, p) => acc + Number(p.total), 0)).toFixed(2);

    return {
      kind, from: q.from, to: q.to, accountIds,
      parents, uncategorised, grandTotal,
    };
  }
}

function parseAccountIds(raw?: string): string[] | null {
  if (raw === undefined) return null;
  if (raw === '') return [];
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p)) {
      throw new Error(`Invalid account id: ${p}`);
    }
  }
  return parts;
}
