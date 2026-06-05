// Tiny event-driven toast. The <Toaster /> component listens for these
// CustomEvents and renders the queue. No context, no deps — call `toast(...)`
// from anywhere (client component, event handler, fire-and-forget).
//
// Usage:
//   toast.success("Saved");
//   toast.error("Could not save: " + e.message);
//   toast("Note", { variant: "info" });

export type ToastVariant = "success" | "error" | "info";

export interface ToastPayload {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
}

function emit(message: string, variant: ToastVariant, durationMs: number) {
  if (typeof window === "undefined") return;
  const detail: ToastPayload = {
    id: Math.random().toString(36).slice(2, 10),
    message,
    variant,
    durationMs,
  };
  window.dispatchEvent(new CustomEvent<ToastPayload>("app:toast", { detail }));
}

export const toast = Object.assign(
  (message: string, opts?: { variant?: ToastVariant; durationMs?: number }) => {
    emit(message, opts?.variant ?? "info", opts?.durationMs ?? 3000);
  },
  {
    success: (message: string, durationMs = 2500) => emit(message, "success", durationMs),
    error: (message: string, durationMs = 5000) => emit(message, "error", durationMs),
    info: (message: string, durationMs = 3000) => emit(message, "info", durationMs),
  },
);
