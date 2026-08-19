"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { getApiErrorMessage, loginWithGoogle } from "@/lib/api";
import { supabaseClient } from "@/lib/supabase";
import { useCreatorStore } from "@/lib/store";

type CallbackState = "pending" | "success" | "error";

export default function GoogleCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useCreatorStore((state) => state.setSession);

  const [state, setState] = useState<CallbackState>("pending");
  const [message, setMessage] = useState("Completing Google sign-in...");
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    void (async () => {
      try {
        if (!supabaseClient) {
          throw new Error("Google auth is not configured yet.");
        }

        const code = searchParams.get("code");
        const oauthError = searchParams.get("error");
        if (oauthError) {
          throw new Error(
            searchParams.get("error_description") || oauthError || "Google sign-in was denied.",
          );
        }

        if (code) {
          const exchange = await supabaseClient.auth.exchangeCodeForSession(code);
          if (exchange.error) {
            throw new Error(exchange.error.message || "Could not complete Google sign-in.");
          }
        }

        const { data, error } = await supabaseClient.auth.getSession();
        if (error) {
          console.warn("supabase getSession error:", error);
        }

        let accessToken: string | undefined = data?.session?.access_token ?? undefined;
        const fallbackToken =
          searchParams.get("access_token") ??
          searchParams.get("provider_token") ??
          searchParams.get("provider_access_token") ??
          undefined;

        if (!accessToken && fallbackToken) {
          accessToken = fallbackToken;
        }

        if (!accessToken) {
          throw new Error("Missing Google access token after sign-in.");
        }

        const session = await loginWithGoogle({ access_token: accessToken });
        setSession({
          userId: session.user_id,
          email: session.email,
          displayName: session.display_name,
          fullName: session.full_name,
          username: session.username,
          avatarUrl: session.avatar_url ?? null,
          onboardingComplete: session.onboarding_complete,
        });

        setState("success");
        setMessage("Google sign-in successful. Redirecting...");
        router.replace(session.onboarding_complete ? "/dashboard" : "/onboarding");
      } catch (err) {
        setState("error");
        setMessage(getApiErrorMessage(err, "Google sign-in failed."));
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

        <h1 className="text-xl font-semibold text-white light:text-slate-900">Google Sign-in</h1>
        <p className="mt-2 text-sm text-slate-300 light:text-slate-600">{message}</p>

        {state === "error" && (
          <div className="mt-5 space-y-2">
            <Link
              href="/auth/login"
              className="inline-block w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700 light:shadow-sm light:hover:bg-slate-50"
            >
              Back to login
            </Link>
            <Link
              href="/welcome"
              className="inline-block w-full rounded-2xl border border-violet-400/25 bg-violet-500/10 px-4 py-3 text-sm font-medium text-violet-300 transition hover:bg-violet-500/15 light:border-violet-300 light:bg-violet-50 light:text-violet-700"
            >
              Back to welcome
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
