import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Papa from 'papaparse';
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

    const importedAt = new Date();

    const report: ImportReport = await this.prisma.$transaction(async (tx) => {
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
      };

      await tx.transactionImport.update({
        where: { id: importRow.id },
        data: {
          rowsImported: importedRows.length,
          rowsSkippedDup: duplicateRows.length,
          reportJson: builtReport as unknown as Prisma.InputJsonValue,
        },
      });

      return builtReport;
    });

    return report;
  }
}
