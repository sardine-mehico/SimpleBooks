import type { Metadata, Viewport } from "next";
import {
  Noto_Sans,
  Inter,
  Source_Sans_3,
  Oswald,
  DM_Sans,
  Manrope,
  Lora,
  Plus_Jakarta_Sans,
} from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/toaster";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { readRuntimeConfig } from "@/lib/runtime-config";

// Force the root layout to render fresh on every request so process.env reads
// pick up runtime values from the container (not build-time inlined).
export const dynamic = "force-dynamic";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-noto-sans",
  display: "swap",
});

// Public-invoice template fonts. Loaded at the root so the CSS variables exist
// on <html> for any page in the app; the customer-facing /i/:token designs
// reference them via `style={{ fontFamily: 'var(--font-inv-…)' }}`. Browsers
// only fetch the font files when an element actually applies the variable, so
// keeping all seven here is cheap until a design uses one.
const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-inv-inter", display: "swap" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-inv-source-sans", display: "swap" });
const oswald = Oswald({ subsets: ["latin"], weight: ["700"], variable: "--font-inv-oswald", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-inv-dm-sans", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-inv-manrope", display: "swap" });
const lora = Lora({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-inv-lora", display: "swap" });
const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-inv-plus-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: "SimpleBooks",
  description: "Minimalist accounting for modern operators.",
  applicationName: "SimpleBooks",
  appleWebApp: {
    capable: true,
    title: "SimpleBooks",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#323D59",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fontVars = [
    notoSans.variable,
    inter.variable,
    sourceSans.variable,
    oswald.variable,
    dmSans.variable,
    manrope.variable,
    lora.variable,
    plusJakarta.variable,
  ].join(" ");
  const cfg = readRuntimeConfig();
  return (
    <html lang="en" className={fontVars}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__SB_CONFIG__=${JSON.stringify({ apiUrl: cfg.apiUrl })};`,
          }}
        />
      </head>
      <body className="font-sans">
        <AppShell>{children}</AppShell>
        <Toaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
