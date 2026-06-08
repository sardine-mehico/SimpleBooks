"use client";

import { useRouter } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { MobileSidebar } from "./mobile-sidebar";
import { useCurrentUser } from "@/lib/use-current-user";
import { logout } from "@/lib/auth";

export function CommandBar() {
  const router = useRouter();
  const user = useCurrentUser();
  const onLogout = async () => {
    await logout();
    router.replace("/login");
    router.refresh();
  };
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md md:gap-4 md:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <MobileSidebar />
        <div className="text-sm font-semibold tracking-tight text-slate-900">SIMPLEBOOKS</div>
      </div>
      <div className="relative hidden md:block md:w-80">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          aria-label="Search"
          placeholder="Search"
          className="h-9 w-full rounded-[0.3rem] border border-slate-200 bg-slate-50/60 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
        />
      </div>
      <div className="flex items-center gap-2">
        {user ? (
          <span className="hidden text-sm text-slate-600 sm:inline-block" title={user.username}>
            {user.displayName}
          </span>
        ) : null}
        <button
          onClick={onLogout}
          className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-5 w-5 md:h-4 md:w-4" />
        </button>
      </div>
    </header>
  );
}
