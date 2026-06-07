"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useCreatorStore } from "@/lib/store";

type CallbackState = "pending" | "success" | "error";

export default function PlatformCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = useCreatorStore((s) => s.userId);
  const hasHydrated = useCreatorStore((s) => s.hasHydrated);

  const [state, setState] = useState<CallbackState>("pending");
  const [platform, setPlatform] = useState<string>("");
  const [handle, setHandle] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const calledRef = useRef(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (calledRef.current) return;
    calledRef.current = true;

    const code = searchParams.get("code");
    const stateParam = searchParams.get("state");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      const desc = searchParams.get("error_description") ?? errorParam;
      setState("error");
      setErrorMessage(`Platform denied access: ${desc}`);
      return;
    }

    if (!code || !stateParam) {
      setState("error");
      setErrorMessage("Missing OAuth response parameters. Please try connecting again.");
      return;
    }

    // Decode platform from state (last segment before the HMAC is the JSON payload)
    let detectedPlatform = "";
    try {
      const encodedPart = stateParam.split(".")[0] ?? "";
      const padding = 4 - (encodedPart.length % 4);
      const padded = encodedPart + "=".repeat(padding % 4);
      const payload = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/"))) as {
        p?: string;
      };
      detectedPlatform = payload.p ?? "";
    } catch {
      setState("error");
      setErrorMessage("Could not read OAuth state. Please try connecting again.");
      return;
    }

    setPlatform(detectedPlatform);

    if (!userId) {
      setState("error");
      setErrorMessage("Your session expired. Please log in and try connecting again.");
      return;
    }

    // Exchange code with backend
    void (async () => {
      try {
        const response = await fetch(`/api/v1/social/oauth/${detectedPlatform}/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, state: stateParam }),
        });

        const data = (await response.json()) as {
          success?: boolean;
          handle?: string;
          detail?: string;
        };

        if (!response.ok) {
          throw new Error(data.detail ?? `HTTP ${response.status}`);
        }

        setHandle(data.handle ?? detectedPlatform);
        setState("success");

        // Redirect to settings after a short pause
        setTimeout(() => {
          router.push("/settings");
        }, 2500);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setState("error");
        setErrorMessage(msg);
      }
    })();
  }, [hasHydrated, userId, searchParams, router]);

  const platformLabel = platform
    ? platform.charAt(0).toUpperCase() + platform.slice(1).replace(/_/g, " ")
    : "Platform";

  return (
    <main className="lux-page flex min-h-screen w-full items-center justify-center px-5 py-12">
      <div className="lux-orb-a" />
      <div className="lux-orb-b" />
      <div className="lux-orb-c" />

      <div className="relative w-full max-w-[420px]">
        <div className="xcr8-panel rounded-[28px] p-7 text-center backdrop-blur-xl">
          {state === "pending" && (
            <>
              <Loader2 size={40} className="mx-auto mb-4 animate-spin text-violet-400" />
              <h1 className="text-lg font-semibold text-white light:text-slate-900">
                Connecting {platformLabel}…
              </h1>
              <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
                Verifying your account. Just a second.
              </p>
            </>
          )}

          {state === "success" && (
            <>
              <CheckCircle2 size={40} className="mx-auto mb-4 text-emerald-400" />
              <h1 className="text-lg font-semibold text-white light:text-slate-900">
                {platformLabel} connected
              </h1>
              <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
                {handle ? (
                  <>
                    Connected as <span className="font-medium text-white">{handle}</span>.
                  </>
                ) : (
                  "Account linked successfully."
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">Redirecting to Settings…</p>
            </>
          )}

          {state === "error" && (
            <>
              <XCircle size={40} className="mx-auto mb-4 text-rose-400" />
              <h1 className="text-lg font-semibold text-white light:text-slate-900">
                Connection failed
              </h1>
              <p className="mt-2 text-sm text-rose-400">{errorMessage}</p>
              <Link
                href="/settings"
                className="mt-5 inline-block rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700"
              >
                Back to Settings
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
