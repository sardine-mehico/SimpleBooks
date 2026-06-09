"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "./section-header";
import { apiClient } from "@/lib/api";
import { toast } from "@/lib/toast";

// Settings → Terms. Single textarea for the global default Terms text that
// the backend pre-populates onto every newly-created invoice and recurring
// rule. Multi-line input is preserved as-is — the textarea writes `\n`
// separators, the backend stores plain text, the invoice form's textarea
// renders them as separate lines, and the React-PDF templates already split
// on `\n` for paragraph layout.
export function TermsForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [terms, setTerms] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.put("/preferences/terms", { defaultInvoiceTerms: terms });
      toast({ title: "Terms saved", description: "Will be applied to new invoices and recurring rules." });
      router.refresh();
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SectionHeader
        title="Terms"
        description="Default Terms text added to every new invoice and recurring invoice. Line breaks are preserved on PDFs and on the public invoice page. Editable by Admin, Bookkeeper, and API users."
      />
      <Card className="p-5">
        <form onSubmit={save} className="flex flex-col gap-3">
          <Textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={10}
            placeholder={"e.g.\nPayment is due within 28 days of the invoice date.\nLate payments may incur interest at 2% per month."}
            className="min-h-[240px] font-sans"
          />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setTerms(initial)} disabled={saving || terms === initial}>
              Revert
            </Button>
            <Button type="submit" disabled={saving || terms === initial}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
