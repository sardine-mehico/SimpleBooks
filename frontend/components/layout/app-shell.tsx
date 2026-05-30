"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { CommandBar } from "./command-bar";

// Wraps every page in the standard chrome (Sidebar + CommandBar + grey
// background) *except* for routes that should render bare:
//   /i/:token        — customer-facing public invoice viewer
//   /preview/...     — operator-only preview routes (email + public-page)
// Both surfaces stand in for what a customer or recipient sees and must
// render without internal nav leaking through.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/i/") || pathname?.startsWith("/preview/")) {
    return <>{children}</>;
  }
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <CommandBar />
        <main className="flex-1 bg-background">{children}</main>
      </div>
    </div>
  );
}
