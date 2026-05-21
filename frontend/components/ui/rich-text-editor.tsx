"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, Underline } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeRichText } from "@/lib/rich-text";

type Props = {
  value: string;
  onChange: (html: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export function RichTextEditor({ value, onChange, rows = 4, placeholder, className, disabled }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Sync incoming `value` to the DOM only when it differs AND the editor isn't
  // the currently focused element. The browser inserts markup with attributes
  // (e.g. `<p style="...">`) as the user types; our sanitizer strips those, so
  // every keystroke produces a `value` that doesn't byte-match `innerHTML`.
  // Rewriting `innerHTML` mid-typing destroys the caret. We only need to push
  // `value` → DOM when the change came from outside (e.g. customer switch
  // auto-fills Payment Details), at which point the editor isn't focused.
  useEffect(() => {
    if (!ref.current) return;
    if (document.activeElement === ref.current) return;
    if (ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  function exec(cmd: "bold" | "italic" | "underline") {
    ref.current?.focus();
    document.execCommand(cmd);
    if (ref.current) onChange(sanitizeRichText(ref.current.innerHTML));
  }

  function handleInput() {
    if (ref.current) onChange(sanitizeRichText(ref.current.innerHTML));
  }

  const minHeight = rows * 22 + 16; // ~22px/line + 16px padding

  return (
    <div
      className={cn(
        "rounded-[0.3rem] border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-indigo-600/20 focus-within:border-indigo-300",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <div className="flex items-center gap-0.5 border-b border-slate-100 px-1.5 py-1">
        <ToolbarButton onClick={() => exec("bold")} label="Bold (Ctrl+B)" disabled={disabled}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("italic")} label="Italic (Ctrl+I)" disabled={disabled}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("underline")} label="Underline (Ctrl+U)" disabled={disabled}>
          <Underline className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        data-placeholder={placeholder}
        className={cn(
          "block w-full px-3 py-2 text-sm text-slate-900 outline-none",
          "[&[data-placeholder]:empty]:before:text-slate-400 [&[data-placeholder]:empty]:before:content-[attr(data-placeholder)]",
          "[&_strong]:font-semibold [&_b]:font-semibold",
          "[&_em]:italic [&_i]:italic",
          "[&_u]:underline"
        )}
        style={{ minHeight: `${minHeight}px` }}
      />
    </div>
  );
}

function ToolbarButton({ onClick, label, children, disabled }: { onClick: () => void; label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={label}
      aria-label={label}
      className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}
