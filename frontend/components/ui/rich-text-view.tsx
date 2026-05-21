import { cn } from "@/lib/utils";
import { sanitizeRichText, plainTextToHtml } from "@/lib/rich-text";

// Renders sanitized HTML for rich-text fields, preserving B/I/U + line breaks.
// `kind="plain"` is for fields stored as plain text with \n line breaks (address, notes).
export function RichTextView({
  html,
  text,
  className,
}: {
  html?: string | null;
  text?: string | null;
  className?: string;
}) {
  const content = html != null
    ? sanitizeRichText(html)
    : text != null
      ? plainTextToHtml(text)
      : "";

  return (
    <div
      className={cn(
        "text-sm text-slate-700 leading-relaxed whitespace-pre-wrap",
        "[&_strong]:font-semibold [&_b]:font-semibold",
        "[&_em]:italic [&_i]:italic",
        "[&_u]:underline",
        className
      )}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
