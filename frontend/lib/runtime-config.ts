// Runtime config — read on every server render from process.env.
// Injected into the HTML <head> as `window.__SB_CONFIG__` by the root layout,
// so the same Docker image works for any domain without rebuilding.
//
// Server-side fetches use `apiUrlInternal` (the in-network hostname);
// browser-side fetches read `apiUrl` from window.__SB_CONFIG__.

export interface RuntimeConfig {
  // Browser-facing backend URL — what users' browsers hit.
  // E.g. https://simplebooks.example.com/api
  apiUrl: string;
  // Server-side (in-container) backend URL — what the frontend container hits
  // when SSR-ing App Router pages. E.g. http://backend:4000
  apiUrlInternal: string;
}

export function readRuntimeConfig(): RuntimeConfig {
  return {
    apiUrl: process.env.API_URL || "http://localhost:4000",
    apiUrlInternal:
      process.env.API_URL_INTERNAL ||
      process.env.NEXT_PUBLIC_API_URL_INTERNAL ||
      "http://backend:4000",
  };
}
