// Re-exports for the public-invoice view. The render pipeline is:
// public-invoice-view.tsx → getPalette(templateKey) → <PalettedInvoice palette=…>
// One layout, ten palettes — one per PDF templateKey in
// backend/src/pdf/templates/index.ts. Aesthetic parity (palette + font) is
// the goal, not pixel parity with the PDF layout.

export { getPalette, DEFAULT_PALETTE, DESIGN_PALETTES } from "./palettes";
export type { DesignPalette } from "./palettes";
export { PalettedInvoice } from "./paletted-invoice";
