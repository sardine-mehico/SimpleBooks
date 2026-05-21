"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function FormActions({
  saving,
  onDelete,
  cancelHref,
  extraActions,
}: {
  saving: boolean;
  onDelete?: () => void;
  cancelHref: string;
  // Optional slot rendered just before Cancel/Save on the right side. Used by
  // the invoice form for the "Send Invoice" button so all three sit on the
  // same rail without bespoke layout.
  extraActions?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="mt-6 flex items-center justify-between">
      {onDelete ? (
        <Button type="button" variant="danger" size="sm" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        {extraActions}
        <Button type="button" variant="ghost" onClick={() => router.push(cancelHref)}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
