"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RecategoriseDialog } from "@/components/transactions/recategorise-dialog";

export function AccountRecategoriseShortcut({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="ml-2 underline" onClick={() => setOpen(true)}>
        Re-categorise uncategorised
      </Button>
      {open && <RecategoriseDialog filter={{ accountIds: [accountId] }} onClose={() => setOpen(false)} />}
    </>
  );
}
