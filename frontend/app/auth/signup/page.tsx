"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getApiErrorMessage, signup } from "@/lib/api";
import { supabaseClient } from "@/lib/supabase";
import { useCreatorStore } from "@/lib/store";
import { ArrowRight, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";

export default function SignupPage() {
  const router = useRouter();
  const setSession = useCreatorStore((state) => state.setSession);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateForm = () => {
    const trimmedFullName = fullName.trim();
    const trimmedUsername = username.trim();

    if (trimmedFullName.length < 2) {
      return "Full name must be at least 2 characters.";
    }

    if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(trimmedUsername)) {
      return "Username must be 3 to 40 characters and use only letters, numbers, dots, hyphens, and underscores.";
    }

    if (password.length < 8 || !/\d/.test(password)) {
      return "Password must be at least 8 characters and include a number.";
    }

    if (password !== confirmPassword) {
      return "Passwords do not match.";
    }

    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!agreeTerms) {
      setError("You must agree to the Terms to continue.");
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const session = await signup({
        full_name: fullName.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
        confirm_password: confirmPassword,
        language: "english",
        timezone: "Africa/Lagos",
      });
      setSession({
        userId: session.user_id,
        email: session.email,
        displayName: session.display_name,
        fullName: session.full_name,
        username: session.username,
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

      <div className="relative grid w-full max-w-5xl gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
        <div className="hidden lg:block">
          <div className="surface-luxe lux-panel cyber-grid rounded-[32px] p-8">
            <p className="section-kicker mb-3">Creator onboarding</p>
            <h2 className="text-4xl font-semibold leading-tight text-white light:text-slate-900">
              Start with a sharp profile and a workspace that feels premium.
            </h2>
            <p className="mt-4 max-w-lg text-sm text-slate-400 light:text-slate-500">
              Set up your identity, connect your channels, and let XCR8 adapt your content voice
              from the first session.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "Identity tuned for creators",
                "AI memory that learns your tone",
                "Cross-platform publishing ready",
                "Built for mobile-first workflows",
              ].map((item) => (
                <div key={item} className="surface-soft rounded-2xl p-3 text-sm text-slate-200 light:text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative w-full max-w-[440px] justify-self-center">
        {/* Brand header */}

        <div className="relative mb-8 flex justify-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Logo size="md" className="!w-[260px] max-w-full -mt-8 md:-mt-10" />
          </Link>
        </div>

        <div className="surface-luxe lux-panel rounded-[28px] p-7 backdrop-blur-xl">
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
                Full name
              </label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="xcr8-input"
                autoComplete="name"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400 light:text-slate-500">
                Username
              </label>
              <input
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="creator.handle"
                className="xcr8-input"
                autoComplete="username"
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
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400 light:text-slate-500">
                Password
              </label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 chars with a number"
                className="xcr8-input"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400 light:text-slate-500">
                Confirm password
              </label>
              <input
                required
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="xcr8-input"
                autoComplete="new-password"
              />
            </div>

            <label className="flex items-start gap-2 text-xs text-slate-500 light:text-slate-400">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5"
              />
              I agree to the Terms of Service and Privacy Policy.
            </label>

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

            <button
              type="button"
              onClick={() => void handleGoogle()}
              className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700 light:shadow-sm light:hover:bg-slate-50"
            >
              Continue with Google
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
      </div>
    </main>
  );
}
