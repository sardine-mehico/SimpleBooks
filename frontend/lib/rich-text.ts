const ALLOWED_TAGS = new Set(["strong", "em", "u", "b", "i", "br", "p", "div", "span"]);

// Whitelist sanitizer for B/I/U + line-break content.
// Strips all attributes and any tag not in the allowed set.
// Acceptable risk for authenticated internal users; do not use on untrusted input.
export function sanitizeRichText(html: string): string {
  if (!html) return "";
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_match, raw) => {
    const tag = String(raw).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const isClose = _match.startsWith("</");
    return `<${isClose ? "/" : ""}${tag}>`;
  });
}

// Convert plain text with newlines to <br>-joined HTML.
export function plainTextToHtml(text: string): string {
  if (!text) return "";
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(/\r?\n/g, "<br>");
}
