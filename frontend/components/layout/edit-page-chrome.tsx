"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shared header chrome for every edit page (Invoices, Customers, Billing
// Companies, Items, Tasks, Recurring Invoices). Renders the page padding,
// entry animation, and the top row containing:
//
//   [← Back]  <Title>                  [Cancel] [Edit?] [Save] [rightActions]
//
// `formId` lets Save submit a form rendered in `children` without nesting the
// form inside the chrome — the wrapped form supplies the id and the chrome's
// Save button uses the HTML5 `form` attribute to submit it. `rightActions`
// is a per-form slot for extras (Invoice puts its hamburger menu here; other
// forms drop a Delete button).
//
// View-mode toggle (`isViewMode` + `onEditClick`): when both are passed, the
// chrome shows an "Edit" button to the left of Save; while in view mode the
// Save button is disabled. This is used by Invoice today to lock fields on
// open and require an explicit Edit click before saving.
export function EditPageChrome({
  title,
  backHref,
  formId,
  onCancel,
  saving,
  isViewMode,
  onEditClick,
  rightActions,
  children,
}: {
  title: string;
  backHref: string;
  formId: string;
  onCancel?: () => void;
  saving?: boolean;
  isViewMode?: boolean;
  onEditClick?: () => void;
  rightActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const cancel = onCancel ?? (() => router.push(backHref));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="px-6 py-6 md:px-8 md:py-8"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            aria-label="Back"
            className="grid h-9 w-9 place-items-center rounded-[0.3rem] border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          {isViewMode && onEditClick ? (
            <Button type="button" variant="outline" onClick={onEditClick}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          ) : null}
          <Button type="submit" form={formId} disabled={saving || isViewMode}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {rightActions}
        </div>
      </div>
      {children}
    </motion.div>
  );
}
