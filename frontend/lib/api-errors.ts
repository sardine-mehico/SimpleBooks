// `apiClient` throws `new Error("<status> <path>: <raw body>")`. The raw body
// is usually a NestJS validation envelope:
//   { "statusCode": 400, "message": ["x must be a string", ...], "error": "Bad Request" }
// Surface the meaningful piece to the user instead of the raw blob.
export function parseApiError(msg?: string): string {
  if (!msg) return "Save failed.";
  const colonIdx = msg.indexOf(": ");
  const body = colonIdx >= 0 ? msg.slice(colonIdx + 2) : msg;
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed?.message)) return parsed.message.join(". ");
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    // body wasn't JSON — fall through and return the raw string
  }
  return body || msg;
}
