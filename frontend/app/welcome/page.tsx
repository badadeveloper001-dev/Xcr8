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
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-10 lg:px-10">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mb-10 flex items-center justify-between"
      >
        <Logo size="md" className="!w-[220px] max-w-full" />
        <Link
          href="/auth/login"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700"
        >
          Log In
        </Link>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="rounded-[28px] border border-white/10 bg-[rgba(15,23,42,0.34)] p-6 shadow-[0_24px_54px_rgba(15,23,42,0.28)] backdrop-blur md:p-10 light:border-slate-200 light:bg-[rgba(255,255,255,0.84)] light:shadow-[0_18px_32px_rgba(15,23,42,0.08)]"
      >
        <p className="mb-3 inline-flex rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200 light:border-cyan-300 light:bg-cyan-100 light:text-cyan-700">
          Creator OS
        </p>
        <h1 className="max-w-3xl text-4xl font-bold leading-[1.06] tracking-tight text-white light:text-slate-900 md:text-6xl">
          Plan, create, and publish in one clean workflow.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-300 light:text-slate-600 md:text-lg">
          XCR8 gives creators one workspace to move from idea to content without distractions.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/auth/signup"
            className="cta-btn inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-base font-semibold"
          >
            Get Started
            <ArrowRight size={16} />
          </Link>
          <button
            type="button"
            onClick={() => void handleGoogle()}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3.5 text-base font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700 light:hover:bg-slate-50"
          >
            Continue with Google
          </button>
        </div>
      </motion.section>
    </main>
  );
}
