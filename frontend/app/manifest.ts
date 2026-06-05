import type { MetadataRoute } from "next";

// PWA manifest. Served at /manifest.webmanifest. Kept minimal: the SVG icon
// covers Chrome/Edge/Firefox; iOS uses the separately-generated apple-icon.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SimpleBooks",
    short_name: "SimpleBooks",
    description: "Minimalist accounting for modern operators.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#EDEEF3",
    theme_color: "#323D59",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
