"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => setSubmitting(false), 600);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#EDEEF3] px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.08)]">
        <div className="flex justify-center pt-2 pb-8">
          <img
            src="/simplebooks-wordmark-dark.svg"
            alt="$impleBooks"
            className="select-none"
            style={{ height: 40, width: "auto" }}
            draggable={false}
          />
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="h-11 bg-slate-50/60 max-sm:h-[48px]"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="h-11 bg-slate-50/60 max-sm:h-[48px]"
          />
          <div className="flex justify-end pt-1">
            <a
              href="#"
              className="text-sm font-medium text-[#323D59] hover:text-[#283248] hover:underline"
            >
              Forgot your password?
            </a>
          </div>
          <Button
            type="submit"
            className="mt-3 h-11 w-full text-base max-sm:h-[48px]"
            disabled={submitting}
          >
            {submitting ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
