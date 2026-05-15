"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getApiErrorMessage, signup } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";
import { ArrowRight, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";

export default function SignupPage() {
  const router = useRouter();
  const setSession = useCreatorStore((state) => state.setSession);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = await signup({
        email,
        display_name: displayName,
        language: "english",
        timezone: "Africa/Lagos",
      });
      setSession({
        userId: session.user_id,
        email: session.email,
        displayName: session.display_name,
        onboardingComplete: session.onboarding_complete,
      });
      router.push("/onboarding");
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          "Could not create account. Start the backend service and try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center px-5 py-12">
      {/* Decorative blobs */}
      <div className="pointer-events-none fixed left-[-120px] top-[-80px] h-[400px] w-[400px] rounded-full bg-violet-600/20 blur-[100px] dark:bg-violet-600/15" />
      <div className="pointer-events-none fixed bottom-[-100px] right-[-100px] h-[350px] w-[350px] rounded-full bg-fuchsia-600/15 blur-[90px] dark:bg-fuchsia-600/10" />

      <div className="relative w-full max-w-[440px]">
        {/* Brand header */}

        <div className="relative mb-8 flex justify-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Logo size="md" className="!w-[260px] max-w-full -mt-8 md:-mt-10" />
          </Link>
        </div>

        <div className="surface-luxe rounded-[28px] p-7 backdrop-blur-xl">
          {/* Badge */}
          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-400 light:border-violet-500/20 light:bg-violet-50 light:text-violet-600">
            <Sparkles size={11} />
            Join thousands of creators
          </div>

          <p className="section-kicker mb-2">Create profile</p>
          <h1 className="text-3xl font-bold tracking-tight text-white light:text-slate-900 sm:text-[2.05rem]">
            Start your workspace
          </h1>
          <p className="mt-1.5 text-sm text-slate-400 light:text-slate-500">
            Create your account, then we will calibrate your creator tone in onboarding.
          </p>

          <form className="mt-6 space-y-3.5" onSubmit={(e) => void handleSubmit(e)}>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400 light:text-slate-500">
                Your name
              </label>
              <input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                className="xcr8-input"
                autoComplete="name"
              />
            </div>
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

            <p className="text-xs text-slate-500 light:text-slate-400">
              By creating an account you agree to our Terms of Service.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="cta-btn inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold disabled:opacity-60"
            >
              {loading ? (
                "Creating account…"
              ) : (
                <>
                  Create account <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

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
            Already have an account?{" "}
            <Link
              href="/auth/login"
              className="font-medium text-violet-400 hover:underline light:text-violet-600"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
