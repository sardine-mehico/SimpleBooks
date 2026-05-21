"use client";

import { Bell, Search } from "lucide-react";
import { MobileSidebar } from "./mobile-sidebar";

export function CommandBar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-6 backdrop-blur-md">
      <div className="flex items-center gap-2 md:hidden">
        <MobileSidebar />
        <div className="text-sm font-semibold tracking-tight text-slate-900">SIMPLEBOOKS</div>
      </div>
      <div className="relative flex-1 md:flex-none md:w-80">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          aria-label="Search"
          placeholder="Search"
          className="h-9 w-full rounded-[0.3rem] border border-slate-200 bg-slate-50/60 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
        />
      </div>
      <button className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
        <Bell className="h-4 w-4" />
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
      </button>
    </header>
  );
}
