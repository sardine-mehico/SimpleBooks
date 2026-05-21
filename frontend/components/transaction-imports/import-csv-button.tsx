"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { ImportCsvDialog } from "./import-csv-dialog";

export function ImportCsvButton({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Import CSV
      </Button>
      {open && <ImportCsvDialog accountId={accountId} onClose={() => setOpen(false)} />}
    </>
  );
}
