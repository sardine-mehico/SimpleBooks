"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Scissors, PlusCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { SplitModal } from "./split-modal";
import type { Category, Transaction } from "@/lib/types";

export function TransactionRowMenu({
  transaction, categories,
}: {
  transaction: Transaction & { splits?: any[] };
  categories: Category[];
}) {
  const [showSplit, setShowSplit] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={(e) => { e.preventDefault(); setShowSplit(true); }}>
            <Scissors className="h-3.5 w-3.5" /> Split
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/rules/new"><PlusCircle className="h-3.5 w-3.5" /> Create rule</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {showSplit && (
        <SplitModal transaction={transaction} categories={categories} onClose={() => setShowSplit(false)} />
      )}
    </>
  );
}
