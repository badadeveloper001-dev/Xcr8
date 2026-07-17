"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { supabaseClient } from "@/lib/supabase";

export default function WelcomePage() {
  const handleGoogle = async () => {
    if (!supabaseClient) return;
    await supabaseClient.auth.signInWithOAuth({ provider: "google" });
  };

  return (
    <main className="lux-page relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12 lg:px-10">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_18%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_80%_80%,rgba(20,184,166,0.12),transparent_30%)]" />

      <div className="mx-auto w-full max-w-3xl">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mb-8 flex items-center justify-between"
        >
          <Logo size="md" className="!w-[180px] max-w-full" />
          <Link
            href="/auth/login"
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Log In
          </Link>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="surface-card rounded-[28px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72 md:p-10"
        >
          <p className="mb-3 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200">
            Creator workspace
          </p>
          <h1 className="max-w-2xl text-3xl font-semibold leading-[1.08] tracking-tight text-slate-950 dark:text-white md:text-5xl">
            One place to plan, create, and publish.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300 md:text-lg">
            XCR8 keeps your tools, ideas, and publishing flow in one clean workspace.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 light:bg-cyan-600 light:text-white light:shadow-[0_10px_28px_rgba(8,145,178,0.3)] light:hover:bg-cyan-500 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            >
              Get started
              <ArrowRight size={16} />
            </Link>
            <button
              type="button"
              onClick={() => void handleGoogle()}
              className="rounded-full border border-slate-300 bg-slate-100 px-6 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Continue with Google
            </button>
          </div>

          <div className="mt-8 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-white/10 dark:bg-white/5">
              Minimal setup
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-white/10 dark:bg-white/5">
              Fast onboarding
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-white/10 dark:bg-white/5">
              Creator-focused
            </span>
          </div>
        </motion.section>
      </div>
    </main>
  );
}
