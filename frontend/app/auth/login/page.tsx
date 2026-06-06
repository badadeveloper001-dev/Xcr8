"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getApiErrorMessage, login } from "@/lib/api";
import { supabaseClient } from "@/lib/supabase";
import { useCreatorStore } from "@/lib/store";
import { ArrowRight, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";

export default function LoginPage() {
  const router = useRouter();
  const setSession = useCreatorStore((state) => state.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const noticeType = params.get("notice");
    const presetEmail = params.get("email");
    if (presetEmail) {
      setEmail(presetEmail);
    }
    if (noticeType === "verify-email") {
      setNotice("Account created. Check your email to verify, then log in.");
    }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = await login({
        email,
        password,
        remember_me: rememberMe,
      });
      setSession({
        userId: session.user_id,
        email: session.email,
        displayName: session.display_name,
        fullName: session.full_name,
        username: session.username,
        avatarUrl: session.avatar_url ?? null,
        onboardingComplete: session.onboarding_complete,
      });
      router.push(session.onboarding_complete ? "/dashboard" : "/onboarding");
    } catch (err) {
      setError(
        getApiErrorMessage(err, "Unable to sign in. Please check your connection and try again."),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (!supabaseClient) {
      setError("Google auth is not configured yet.");
      return;
    }
    await supabaseClient.auth.signInWithOAuth({ provider: "google" });
  };

  return (
    <main className="lux-page flex min-h-screen w-full items-center justify-center px-5 py-12">
      <div className="lux-orb-a" />
      <div className="lux-orb-b" />
      <div className="lux-orb-c" />

      <div className="relative w-full max-w-[440px]">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Logo size="md" className="!w-[220px] max-w-full" />
          </Link>
        </div>

        <div className="xcr8-panel rounded-[28px] p-7 backdrop-blur-xl">
          {/* Badge */}
          <div className="xcr8-soft-chip mb-5 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium">
            <Sparkles size={11} />
            Creator workspace
          </div>

          <p className="xcr8-eyebrow mb-2">Welcome back</p>
          <h1 className="xcr8-title-xl text-white light:text-slate-900">Welcome back</h1>
          <p className="xcr8-subtle mt-1.5 text-sm">
            Sign in to continue to your creator workspace.
          </p>

          <form className="mt-6 space-y-3.5" onSubmit={(e) => void handleSubmit(e)}>
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

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400 light:text-slate-500">
                Password
              </label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="xcr8-input"
                autoComplete="current-password"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-slate-400 light:text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>
              <Link
                href="/auth/forgot-password"
                className="font-medium text-violet-400 hover:underline light:text-violet-600"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="cta-btn mt-1 inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold disabled:opacity-60"
            >
              {loading ? (
                "Signing in…"
              ) : (
                <>
                  Log In <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10 light:bg-slate-200" />
            <span className="text-xs text-slate-500">or</span>
            <div className="h-px flex-1 bg-white/10 light:bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={() => void handleGoogle()}
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700 light:shadow-sm light:hover:bg-slate-50"
          >
            Continue with Google
          </button>

          {notice ? (
            <p className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2.5 text-sm text-cyan-200 light:text-cyan-700">
              {notice}
            </p>
          ) : null}

          {error && (
            <p
              role="status"
              aria-live="polite"
              className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-400"
            >
              {error}
            </p>
          )}

          <p className="mt-5 text-center text-sm text-slate-500">
            New here?{" "}
            <Link
              href="/auth/signup"
              className="font-medium text-violet-400 hover:underline light:text-violet-600"
            >
              Create account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
