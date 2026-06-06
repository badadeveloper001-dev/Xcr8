"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getApiErrorMessage, signup, verifySignupCode, verifySignupPassword } from "@/lib/api";
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
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
    if (!codeSent) {
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
      setNotice(null);
      try {
        const response = await signup({
          full_name: fullName.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
          confirm_password: confirmPassword,
          language: "english",
          timezone: "Africa/Lagos",
        });
        setCodeSent(true);
        setNotice(response.message || "Verification code sent. Check your email inbox.");
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
      return;
    }

    if (verificationCode.trim().length < 4) {
      setError("Enter the verification code sent to your email.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const session = await verifySignupCode({
        email: email.trim(),
        code: verificationCode.trim(),
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
        getApiErrorMessage(err, "Invalid or expired code. Request a new code and try again."),
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

  const handleVerifyWithPassword = async () => {
    if (!codeSent || password.length < 8) {
      setError("Enter your account password to continue.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const session = await verifySignupPassword({
        email: email.trim(),
        password,
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
        getApiErrorMessage(err, "Could not verify with password. Please check your password."),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="lux-page flex min-h-screen w-full items-center justify-center px-5 py-12">
      <div className="lux-orb-a" />
      <div className="lux-orb-b" />
      <div className="lux-orb-c" />

      <div className="relative mx-auto w-full max-w-3xl">
        <section className="xcr8-panel rounded-[30px] border-2 border-cyan-300/30 p-6 sm:p-7">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <Logo size="md" className="!w-[230px] max-w-full" />
            </Link>
            <div className="xcr8-soft-chip inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium">
              <Sparkles size={11} />
              {codeSent ? "Step 2 of 2" : "Step 1 of 2"}
            </div>
          </div>

          <p className="xcr8-eyebrow mb-2">Create profile</p>
          <h1 className="xcr8-title-xl text-white light:text-slate-900">
            {codeSent ? "Verify your email" : "Start your workspace"}
          </h1>
          <p className="xcr8-subtle mt-1.5 text-sm">
            {codeSent
              ? "Enter the code sent to your email to continue to onboarding."
              : "Create your account, then verify your email code before onboarding."}
          </p>

          <form className="mt-6 space-y-3.5" onSubmit={(e) => void handleSubmit(e)}>
            {!codeSent ? (
              <>
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
              </>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400 light:text-slate-500">
                  Verification code
                </label>
                <input
                  required
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\s+/g, ""))}
                  placeholder="Enter the 6-digit code"
                  className="xcr8-input"
                  autoComplete="one-time-code"
                />
                <p className="mt-2 text-xs text-slate-500 light:text-slate-500">
                  Sent to {email.trim()}. If you did not receive it, use resend code below.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="cta-btn inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold disabled:opacity-60"
            >
              {loading ? (
                codeSent ? (
                  "Verifying code..."
                ) : (
                  "Sending code..."
                )
              ) : (
                <>
                  {codeSent ? "Verify code" : "Send email code"} <ArrowRight size={16} />
                </>
              )}
            </button>

            {!codeSent ? (
              <button
                type="button"
                onClick={() => void handleGoogle()}
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700 light:shadow-sm light:hover:bg-slate-50"
              >
                Continue with Google
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => void handleVerifyWithPassword()}
                  disabled={loading}
                  className="w-full rounded-2xl border border-emerald-400/25 bg-emerald-500/10 py-3.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/15 disabled:opacity-60 light:border-emerald-300 light:bg-emerald-50 light:text-emerald-700"
                >
                  I did not get a code, verify with password
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCodeSent(false);
                    setVerificationCode("");
                    setNotice(null);
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700 light:shadow-sm light:hover:bg-slate-50"
                >
                  Edit signup details / resend code
                </button>
              </div>
            )}
          </form>

          {notice && (
            <p className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2.5 text-sm text-cyan-300">
              {notice}
            </p>
          )}

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
        </section>
      </div>
    </main>
  );
}
