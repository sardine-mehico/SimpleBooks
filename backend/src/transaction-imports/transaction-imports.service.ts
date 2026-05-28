import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Papa from 'papaparse';
import { PrismaService } from '../prisma/prisma.service';
import { RuleEngineService } from '../rule-engine/rule-engine.service';
import { TagsService } from '../tags/tags.service';
import { parseCsv } from './csv-parser.service';
import { sniffCsv } from './csv-sniffer.service';
import { fileSha256, rowImportHash } from './hash';
import { assignOrdinals } from './ordinals';
import { ColumnMapping, ImportRuleCategorisation, ImportReport, MappingSuggestion } from './types';

const MAX_BYTES = 10 * 1024 * 1024;

@Injectable()
export class TransactionImportsService {
  constructor(
    private prisma: PrismaService,
    private engine: RuleEngineService,
    private tags: TagsService,
  ) {}

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
    applyRules = false,
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
    const withOrdinals = assignOrdinals(rows);
    const hashed = withOrdinals.map((r) => ({
      ...r,
      importHash: rowImportHash(r.date, r.amount, r.description, r.ordinal),
    }));

    // Read the parsed rows' balance column for validation only. If present and
    // arithmetic doesn't hold (balance[last] - balance[first] vs Σ amount[1..]),
    // emit a warning so the user can spot incomplete/duplicate-source files.
    function computeBalanceMismatch(): string | null {
      const withBalance = rows.filter((r) => r.runningBalance !== null);
      if (withBalance.length < 2) return null;
      // rows are returned in CSV file order, which for CBA-style exports is
      // newest-first; sort chronologically before computing the delta.
      const chrono = [...withBalance].sort((a, b) => a.date.localeCompare(b.date));
      const first = Number(chrono[0].runningBalance);
      const last = Number(chrono[chrono.length - 1].runningBalance);
      const sumAmounts = chrono.slice(1).reduce((acc, r) => acc + Number(r.amount), 0);
      const diff = last - first - sumAmounts;
      if (Math.abs(diff) > 0.01) {
        return `Balance arithmetic mismatch: bank's running balance moved by $${(last - first).toFixed(2)} across ${chrono.length} rows, but the amounts sum to $${sumAmounts.toFixed(2)} (off by $${diff.toFixed(2)}). The file may be incomplete or have duplicate rows.`;
      }
      return null;
    }
    const balanceWarning = computeBalanceMismatch();

    const warnings: string[] = [];

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
    if (balanceWarning) warnings.push(balanceWarning);

    const importedAt = new Date();

    const { report, importId, importedRowCount } = await this.prisma.$transaction(async (tx) => {
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
          reportJson: {} as unknown as Prisma.InputJsonValue,
        },
      });

      // Insert with skipDuplicates so the unique index drops dupes server-side.
      await tx.transaction.createMany({
        data: hashed.map((r) => ({
          accountId,
          date: new Date(r.date),
          amount: new Prisma.Decimal(r.amount),
          description: r.description,
          importHash: r.importHash,
          importId: importRow.id,
        })),
        skipDuplicates: true,
      });

      // Sanity check: after createMany with skipDuplicates, the number of rows
      // with this importId equals the number of distinct hashes in our batch
      // that were not already in the DB. If those don't match, rows were
      // silently dropped — fail loudly rather than report bogus counts.
      const landedForThisImport = await tx.transaction.count({
        where: { importId: importRow.id },
      });
      const batchHashes = new Set(hashed.map((r) => r.importHash));
      const preexisting = await tx.transaction.count({
        where: {
          accountId,
          importHash: { in: Array.from(batchHashes) },
          NOT: { importId: importRow.id },
        },
      });
      const expectedLanded = batchHashes.size - preexisting;
      if (landedForThisImport !== expectedLanded) {
        throw new BadRequestException(
          `Import sanity check failed: expected ${expectedLanded} rows to land ` +
          `(${batchHashes.size} distinct hashes in batch minus ${preexisting} ` +
          `already in DB) but ${landedForThisImport} actually landed for importId ` +
          `${importRow.id}. Rows were silently dropped — likely a concurrent ` +
          `import of the same data, or a database-level constraint we don't ` +
          `know about. The import has been rolled back; retry if you believe ` +
          `it was a transient race.`,
        );
      }

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

      const builtReport: ImportReport = {
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
        ruleCategorisation: null,
      };

      await tx.transactionImport.update({
        where: { id: importRow.id },
        data: {
          rowsImported: importedRows.length,
          rowsSkippedDup: duplicateRows.length,
          reportJson: builtReport as unknown as Prisma.InputJsonValue,
        },
      });

      return { report: builtReport, importId: importRow.id, importedRowCount: importedRows.length };
    });

    // Run rule-engine over just-inserted transactions after the DB transaction
    // has committed (engine uses this.prisma directly, not the tx handle).
    if (applyRules && importedRowCount > 0) {
      const insertedTransactions = await this.prisma.transaction.findMany({
        where: { importId },
        select: { id: true },
      });
      const txIds = insertedTransactions.map((t) => t.id);
      const engineResult = await this.engine.run({
        transactionIds: txIds,
        preserveSplits: true,
        applyRules: true,
        dryRun: false,
      });
      const ruleCategoryMap = new Map<string, { categoryName: string }>();
      for (const r of engineResult.rows) {
        if (r.ruleMatch && !ruleCategoryMap.has(r.ruleMatch.ruleId)) {
          ruleCategoryMap.set(r.ruleMatch.ruleId, { categoryName: r.ruleMatch.categoryName });
        }
      }
      const ruleCategorisation: ImportRuleCategorisation = {
        enabled: true,
        ruleMatched: engineResult.stats.ruleMatched,
        perRule: engineResult.stats.perRule.map((p) => ({
          ...p,
          categoryName: ruleCategoryMap.get(p.ruleId)?.categoryName ?? '',
        })),
      };
      report.ruleCategorisation = ruleCategorisation;
      await this.prisma.transactionImport.update({
        where: { id: importId },
        data: { reportJson: report as unknown as Prisma.InputJsonValue },
      });
    }

    // Auto-alias pass: always runs on import (regardless of applyRules) so the
    // user's tag aliases attach to newly-imported descriptions.
    if (importedRowCount > 0) {
      const inserted = await this.prisma.transaction.findMany({
        where: { importId },
        select: { id: true },
      });
      await this.tags.autoAliasApply({ transactionIds: inserted.map((t) => t.id) });
    }

    return report;
  }
}
