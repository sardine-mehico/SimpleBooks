"use client";

import { ReactNode } from "react";
import { useCapability } from "@/lib/use-current-user";
import type { Capability } from "@/lib/capabilities";

// Render children only if the current user has the given capability.
// Hidden during the brief "user still loading" window so UI never flashes
// a button the role can't use.
export function Can({ c, children, fallback = null }: { c: Capability; children: ReactNode; fallback?: ReactNode }) {
  const allowed = useCapability(c);
  return allowed ? <>{children}</> : <>{fallback}</>;
}
