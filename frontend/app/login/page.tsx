"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, LANDING_BY_ROLE } from "@/lib/auth";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(username.trim(), password);
      const next = search.get("next");
      router.replace(next && next.startsWith("/") ? next : LANDING_BY_ROLE[user.role]);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Login failed.");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#EDEEF3] px-4">
      <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.08)]">
        <div className="flex justify-center bg-[#323D59] py-6">
          <img
            src="/simplebooks-wordmark.svg"
            alt="$impleBooks"
            className="select-none"
            style={{ height: 40, width: "auto" }}
            draggable={false}
          />
        </div>
        <form onSubmit={onSubmit} className="space-y-3 p-8">
          <Input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
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
          {error ? (
            <p className="text-sm text-rose-600" role="alert">{error}</p>
          ) : null}
          <Button
            type="submit"
            className="mt-4 h-11 w-full text-base max-sm:h-[48px]"
            disabled={submitting}
          >
            {submitting ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#EDEEF3]" />}>
      <LoginForm />
    </Suspense>
  );
}
