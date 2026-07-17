"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { getApiErrorMessage, verifySignupLink } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

type ConfirmState = "pending" | "success" | "error";

export default function ConfirmEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useCreatorStore((state) => state.setSession);

  const [state, setState] = useState<ConfirmState>("pending");
  const [message, setMessage] = useState("Verifying your email confirmation link...");
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const tokenHash = searchParams.get("token_hash");
    const typeParam = searchParams.get("type");
    const email = searchParams.get("email");
    const errorParam = searchParams.get("error_description") || searchParams.get("error");

    if (errorParam) {
      setState("error");
      setMessage(String(errorParam));
      return;
    }

    if (!tokenHash || !email) {
      setState("error");
      setMessage("Invalid confirmation link. Please request a new verification email.");
      return;
    }

    const verifyType = typeParam === "signup" ? "signup" : "email";

    void (async () => {
      try {
        const session = await verifySignupLink({
          email,
          token_hash: tokenHash,
          type: verifyType,
        });

        setSession({
          userId: session.user_id,
          email: session.email,
          displayName: session.display_name,
          fullName: session.full_name,
          username: session.username,
          avatarUrl: (session as { avatar_url?: string | null }).avatar_url ?? null,
          onboardingComplete: session.onboarding_complete,
        });

        setState("success");
        setMessage("Email confirmed successfully. Redirecting...");

        setTimeout(() => {
          router.replace(session.onboarding_complete ? "/dashboard" : "/onboarding");
        }, 1200);
      } catch (err) {
        setState("error");
        setMessage(getApiErrorMessage(err, "Could not verify confirmation link."));
      }
    })();
  }, [router, searchParams, setSession]);

  return (
    <main className="lux-page flex min-h-screen w-full items-center justify-center px-5 py-12">
      <div className="lux-orb-a" />
      <div className="lux-orb-b" />
      <div className="lux-orb-c" />

      <section className="xcr8-panel w-full max-w-[460px] rounded-[28px] p-7 text-center">
        {state === "pending" && (
          <Loader2 size={40} className="mx-auto mb-4 animate-spin text-violet-400" />
        )}
        {state === "success" && (
          <CheckCircle2 size={40} className="mx-auto mb-4 text-emerald-400" />
        )}
        {state === "error" && <XCircle size={40} className="mx-auto mb-4 text-rose-400" />}

        <h1 className="text-xl font-semibold text-white light:text-slate-900">
          Email Confirmation
        </h1>
        <p className="mt-2 text-sm text-slate-300 light:text-slate-600">{message}</p>

        {state === "error" && (
          <div className="mt-5 space-y-2">
            <Link
              href="/auth/signup"
              className="inline-block w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700 light:shadow-sm light:hover:bg-slate-50"
            >
              Back to signup
            </Link>
            <Link
              href="/auth/login"
              className="inline-block w-full rounded-2xl border border-violet-400/25 bg-violet-500/10 px-4 py-3 text-sm font-medium text-violet-300 transition hover:bg-violet-500/15 light:border-violet-300 light:bg-violet-50 light:text-violet-700"
            >
              Go to login
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
