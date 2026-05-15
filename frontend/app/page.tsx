"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";
import { getSession } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

export default function SplashPage() {
  const router = useRouter();

  useEffect(() => {
    const boot = async () => {
      const { userId, setSession, clearSession } = useCreatorStore.getState();
      if (userId) {
        try {
          const session = await getSession(userId);
          setSession({
            userId: session.user_id,
            email: session.email,
            displayName: session.display_name,
            fullName: session.full_name,
            username: session.username,
            onboardingComplete: session.onboarding_complete,
          });
          router.replace(session.onboarding_complete ? "/dashboard" : "/onboarding");
          return;
        } catch {
          clearSession();
        }
      }
      router.replace("/welcome");
    };

    const timer = window.setTimeout(() => {
      void boot();
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.18),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_30%)]" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="surface-luxe cyber-grid neon-ring relative z-10 w-full max-w-2xl rounded-[32px] px-6 py-12 text-center sm:px-10"
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto mb-6 w-fit"
        >
          <Logo size="md" className="!w-[280px] max-w-full" />
        </motion.div>
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1.5 text-xs font-medium text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
          <Sparkles size={12} />
          AI Powered Platform For Content Creators
        </div>
        <h1 className="text-holo text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Building your creator intelligence system
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-slate-400 light:text-slate-500 sm:text-base">
          Loading your session, personalization, and publishing workspace.
        </p>
      </motion.div>
    </main>
  );
}
