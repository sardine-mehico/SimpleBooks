import * as React from "react";
import { cn } from "@/lib/utils";

// `Field` renders `<label>` by default so clicking the label text focuses the
// child input. For non-labelable children (rich-text editors built on
// `contentEditable`, or any custom widget containing its own focusable
// elements), set `as="div"`. Otherwise the browser's native label-click
// delegation forwards a click on the label to the *first* labelable form
// control it finds inside — which for our rich-text editor is the Bold
// toolbar button, not the editing surface, and the cursor never lands in the
// editor.
export function Field({
  label,
  hint,
  required,
  children,
  className,
  as = "label",
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  as?: "label" | "div";
}) {
  const Tag = as;
  return (
    <Tag className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-slate-600">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[11px] text-slate-400">{hint}</span> : null}
    </Tag>
  );
}
