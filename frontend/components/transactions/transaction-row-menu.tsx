"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Pencil, Scissors, PlusCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { SplitModal } from "./split-modal";
import { TransactionEditModal } from "./transaction-edit-modal";
import type { Category, Transaction, Vendor } from "@/lib/types";

export function TransactionRowMenu({
  transaction, categories, vendors,
}: {
  transaction: Transaction & { splits?: any[]; account?: { id: string; name: string } };
  categories: Category[];
  vendors: Vendor[];
}) {
  const [showEdit, setShowEdit] = useState(false);
  const [showSplit, setShowSplit] = useState(false);

  function openSplitFromEdit() {
    setShowEdit(false);
    setShowSplit(true);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" aria-label="Actions"><MoreHorizontal className="h-4 w-4"/></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={(e) => { e.preventDefault(); setShowEdit(true); }}>
            <Pencil className="h-3.5 w-3.5"/> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.preventDefault(); setShowSplit(true); }}>
            <Scissors className="h-3.5 w-3.5"/> Split
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/rules/new"><PlusCircle className="h-3.5 w-3.5"/> Create rule</Link>
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
