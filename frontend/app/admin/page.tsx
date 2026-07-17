"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";

const ADMIN_SESSION_KEY = "xcr8-admin-access";

export default function AdminLoginPage() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (existing) {
      router.replace("/admin/dashboard");
    }
  }, [router]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = accessCode.trim();
    if (!code) {
      setError("Enter access code.");
      return;
    }
    sessionStorage.setItem(ADMIN_SESSION_KEY, code);
    router.push("/admin/dashboard");
  };

  return (
    <main className="lux-page flex min-h-screen items-center justify-center px-5 py-12">
      <div className="lux-orb-a" />
      <div className="lux-orb-b" />
      <div className="lux-orb-c" />

      <section className="xcr8-panel w-full max-w-[460px] rounded-[28px] border border-cyan-300/30 p-7">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-200 light:text-cyan-700">
          <ShieldCheck size={14} />
          Admin Access
        </div>

        <h1 className="xcr8-title-xl text-white light:text-slate-900">XCR8 Admin Portal</h1>
        <p className="xcr8-subtle mt-2 text-sm">Enter your access code to continue.</p>

        <form className="mt-6 space-y-3.5" onSubmit={submit}>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400 light:text-slate-500">
              Access Code
            </label>
            <input
              value={accessCode}
              onChange={(e) => {
                setAccessCode(e.target.value);
                setError(null);
              }}
              placeholder="Enter admin code"
              className="xcr8-input"
              autoComplete="one-time-code"
            />
          </div>

          <button
            type="submit"
            className="cta-btn inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold"
          >
            Open Admin Dashboard
            <ArrowRight size={16} />
          </button>
        </form>

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-400">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
