// One palette per PDF templateKey. Hex values are pulled directly from each
// React-PDF template's `COLOR` object so the public viewing page matches the
// PDF aesthetically. Fonts come from the CSS variables set on `<html>` by
// `frontend/app/layout.tsx`.

export type DesignPalette = {
  fontVar: string;
  pageBg: string;
  brand: string;
  ink: string;
  inkSoft: string;
  border: string;
};

export const DEFAULT_PALETTE: DesignPalette = {
  fontVar: "var(--font-inv-inter)",
  pageBg: "#f5f5f7",
  brand: "#4d5970",
  ink: "#1a1a1a",
  inkSoft: "#6b7280",
  border: "#d1d5db",
};

export const DESIGN_PALETTES: Record<string, DesignPalette> = {
  "design-1": {
    fontVar: "var(--font-inv-inter)",
    pageBg: "#e3e6ed",
    brand: "#4d5970",
    ink: "#1a1a1a",
    inkSoft: "#6b7280",
    border: "#d1d5db",
  },
  "design-2": {
    fontVar: "var(--font-inv-inter)",
    pageBg: "#fceee5",
    brand: "#c4451c",
    ink: "#1a1a1a",
    inkSoft: "#7c8285",
    border: "#d8d2cd",
  },
  "design-3": {
    fontVar: "var(--font-inv-inter)",
    pageBg: "#F7FAFC",
    brand: "#3182CE",
    ink: "#1a1a1a",
    inkSoft: "#64748b",
    border: "#cbd5e0",
  },
  "design-4": {
    fontVar: "var(--font-inv-inter)",
    pageBg: "#fff1e6",
    brand: "#ea580c",
    ink: "#1a1a1a",
    inkSoft: "#5b6166",
    border: "#e2e8f0",
  },
  "design-5": {
    fontVar: "var(--font-inv-source-sans)",
    pageBg: "#f1f5f9",
    brand: "#2d3748",
    ink: "#1a1a1a",
    inkSoft: "#64748b",
    border: "#cbd5e0",
  },
  "design-6": {
    fontVar: "var(--font-inv-inter)",
    pageBg: "#f5e2e8",
    brand: "#b51449",
    ink: "#1a1a1a",
    inkSoft: "#6b7280",
    border: "#d1d5db",
  },
  "design-7": {
    fontVar: "var(--font-inv-dm-sans)",
    pageBg: "#eaf1f4",
    brand: "#2c8a92",
    ink: "#1a1a1a",
    inkSoft: "#6b7280",
    border: "#cbd5e0",
  },
  "design-8": {
    fontVar: "var(--font-inv-manrope)",
    pageBg: "#f0f4ee",
    brand: "#6b958f",
    ink: "#1a1a1a",
    inkSoft: "#6b7280",
    border: "#cfdcd9",
  },
  "design-9": {
    fontVar: "var(--font-inv-lora)",
    pageBg: "#f2efe9",
    brand: "#b3541a",
    ink: "#1a1a1a",
    inkSoft: "#4a4540",
    border: "#bcb3a5",
  },
  "design-10": {
    fontVar: "var(--font-inv-plus-jakarta)",
    pageBg: "#e8e8eb",
    brand: "#1849a6",
    ink: "#1a1a1a",
    inkSoft: "#4a4a4a",
    border: "#c0c4c9",
  },
};

export function getPalette(templateKey: string | null | undefined): DesignPalette {
  if (!templateKey) return DEFAULT_PALETTE;
  return DESIGN_PALETTES[templateKey] ?? DEFAULT_PALETTE;
}
