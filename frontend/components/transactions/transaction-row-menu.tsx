"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Pencil, Scissors, PlusCircle, Trash2, Coins } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { SplitModal } from "./split-modal";
import { TransactionEditModal } from "./transaction-edit-modal";
import { deleteTransaction } from "@/lib/banking";
import type { Category, Transaction, Vendor } from "@/lib/types";

export function TransactionRowMenu({
  transaction, categories, vendors, onApplyToInvoices,
}: {
  transaction: Transaction & { splits?: any[]; account?: { id: string; name: string } };
  categories: Category[];
  vendors: Vendor[];
  onApplyToInvoices?: (t: Transaction) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearch = useSearchParams();
  const [showEdit, setShowEdit] = useState(false);
  const [showSplit, setShowSplit] = useState(false);

  function openSplitFromEdit() {
    setShowEdit(false);
    setShowSplit(true);
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    if (!confirm('Delete this transaction? This will also remove its splits and categorisation history.')) return;
    await deleteTransaction(transaction.id);
    const params = new URLSearchParams(urlSearch.toString());
    params.set('r', String(Date.now()));
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" aria-label="Actions"><MoreHorizontal className="h-4 w-4"/></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onApplyToInvoices?.(transaction)}>
            <Coins className="h-3.5 w-3.5"/> Apply to invoices
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={(e) => { e.preventDefault(); setShowEdit(true); }}>
            <Pencil className="h-3.5 w-3.5"/> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.preventDefault(); setShowSplit(true); }}>
            <Scissors className="h-3.5 w-3.5"/> Split
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/rules/new"><PlusCircle className="h-3.5 w-3.5"/> Create rule</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDelete} className="text-rose-600 focus:text-rose-700">
            <Trash2 className="h-3.5 w-3.5"/> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {showEdit && (
        <TransactionEditModal
          transaction={transaction}
          categories={categories}
          vendors={vendors}
          onClose={() => setShowEdit(false)}
          onManageSplits={openSplitFromEdit}
        />
      )}
      {showSplit && (
        <SplitModal transaction={transaction} categories={categories} onClose={() => setShowSplit(false)} />
      )}
    </>
  );
}
