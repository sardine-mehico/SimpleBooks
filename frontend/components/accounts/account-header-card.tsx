"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import type { Account } from "@/lib/types";

function fmt(amount: string | number | undefined) {
  return `$${Number(amount ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AccountHeaderCard({
  account, rightAction,
  categorisedCount, totalCount,
  recategoriseShortcut,
}: {
  account: Account;
  rightAction?: React.ReactNode;
  categorisedCount?: number;
  totalCount?: number;
  recategoriseShortcut?: React.ReactNode;
}) {
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
          {totalCount !== undefined && totalCount > 0 && categorisedCount !== undefined && (
            <div className="mt-2 text-xs text-slate-500">
              Categorisation: {categorisedCount} of {totalCount} categorised
              ({Math.round((categorisedCount / totalCount) * 100)}%) ·{" "}
              {totalCount - categorisedCount} uncategorised
              {recategoriseShortcut}
            </div>
          )}
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
