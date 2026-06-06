"use client";

import { useEffect, useState } from "react";
import { getCurrentUser, type AuthUser } from "./auth";
import { capabilitiesForRole, type Capability } from "./capabilities";

// Client-side hook to read the current user. Returns null while loading
// or if unauthenticated. The middleware ensures most paths only render
// for authenticated users, so this is mainly for displaying name + role
// in chrome.
export function useCurrentUser(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => {
    let cancelled = false;
    getCurrentUser().then((u) => { if (!cancelled) setUser(u); });
    return () => { cancelled = true; };
  }, []);
  return user;
}

// Capability check hook — returns true once the user is loaded and the
// capability is granted, false otherwise. While the user is still loading
// returns false (fail-closed) so UI doesn't briefly render forbidden state.
export function useCapability(capability: Capability): boolean {
  const user = useCurrentUser();
  if (!user) return false;
  return capabilitiesForRole(user.role)[capability];
}

// Full capability set for the current user — useful when checking multiple
// capabilities in one render pass (e.g. sidebar filtering).
export function useCapabilities(): Record<Capability, boolean> | null {
  const user = useCurrentUser();
  if (!user) return null;
  return capabilitiesForRole(user.role);
}
