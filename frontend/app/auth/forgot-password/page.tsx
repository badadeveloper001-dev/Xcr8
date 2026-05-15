"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { requestPasswordReset, getApiErrorMessage } from "@/lib/api";
import { ArrowRight, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    setError(null);
    try {
      const result = await requestPasswordReset({ email });
      setNotice(result.message);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not send reset link. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center px-5 py-12">
      <div className="pointer-events-none fixed left-[-120px] top-[-80px] h-[400px] w-[400px] rounded-full bg-violet-600/20 blur-[100px] dark:bg-violet-600/15" />
      <div className="pointer-events-none fixed bottom-[-100px] right-[-100px] h-[350px] w-[350px] rounded-full bg-fuchsia-600/15 blur-[90px] dark:bg-fuchsia-600/10" />

      <div className="relative w-full max-w-[440px]">
        <div className="mb-8 text-center">
          <Link href="/welcome" className="inline-flex items-center gap-2.5">
            <Logo size="md" className="!w-[220px] max-w-full" />
          </Link>
        </div>

        <div className="surface-luxe rounded-[28px] p-7 backdrop-blur-xl">
          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-400 light:border-violet-500/20 light:bg-violet-50 light:text-violet-600">
            <Sparkles size={11} />
            Account recovery
          </div>

          <p className="section-kicker mb-2">Forgot password</p>
          <h1 className="text-3xl font-bold tracking-tight text-white light:text-slate-900 sm:text-[2.05rem]">
            Reset your password
          </h1>
          <p className="mt-1.5 text-sm text-slate-400 light:text-slate-500">
            Enter your account email and we will send a reset link.
          </p>

          <form className="mt-6 space-y-3.5" onSubmit={(e) => void onSubmit(e)}>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400 light:text-slate-500">
                Email address
              </label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="xcr8-input"
                autoComplete="email"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="cta-btn inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold disabled:opacity-60"
            >
              {loading ? (
                "Sending link…"
              ) : (
                <>
                  Send Reset Link <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {notice ? (
            <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300 light:text-emerald-700">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-400">
              {error}
            </p>
          ) : null}

          <p className="mt-5 text-center text-sm text-slate-500">
            Back to{" "}
            <Link
              href="/auth/login"
              className="font-medium text-violet-400 hover:underline light:text-violet-600"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
