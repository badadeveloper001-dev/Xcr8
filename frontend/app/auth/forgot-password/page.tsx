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
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    setResetUrl(null);
    setError(null);
    try {
      const result = await requestPasswordReset({ email });
      setNotice(result.message);
      setResetUrl(result.reset_url ?? null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not send reset link. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="lux-page flex min-h-screen w-full items-center justify-center px-5 py-12">
      <div className="lux-orb-a" />
      <div className="lux-orb-b" />
      <div className="lux-orb-c" />

      <div className="relative w-full max-w-[440px]">
        <div className="mb-8 text-center">
          <Link href="/welcome" className="inline-flex items-center gap-2.5">
            <Logo size="md" className="!w-[220px] max-w-full" />
          </Link>
        </div>

        <div className="surface-luxe lux-panel rounded-[28px] p-7 backdrop-blur-xl">
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
          {resetUrl ? (
            <p className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 py-2.5 text-sm text-violet-200 light:text-violet-700">
              Development reset link:{" "}
              <Link href={resetUrl} className="font-semibold underline">
                Open reset page
              </Link>
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-400">
              {error}
            </p>
          ) : null}

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {[
              "Reset link is time-limited",
              "Use the same email as your account",
            ].map((item) => (
              <div key={item} className="surface-soft rounded-2xl px-3 py-2 text-xs text-slate-400 light:text-slate-600">
                {item}
              </div>
            ))}
          </div>

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
