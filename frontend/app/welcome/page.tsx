"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";
import { supabaseClient } from "@/lib/supabase";

export default function WelcomePage() {
  const handleGoogle = async () => {
    if (!supabaseClient) return;
    await supabaseClient.auth.signInWithOAuth({ provider: "google" });
  };

  return (
    <main className="lux-page mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-12 lg:px-10">
      <div className="lux-orb-a" />
      <div className="lux-orb-b" />
      <div className="lux-orb-c" />
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mb-14 flex items-center justify-between"
      >
        <Logo size="md" className="!w-[220px] max-w-full" />
        <Link
          href="/auth/login"
          className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 transition hover:text-white light:text-slate-600 light:hover:text-slate-900"
        >
          Log In
        </Link>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="surface-luxe lux-panel cyber-grid neon-ring rounded-[30px] px-6 py-10 text-center sm:px-10"
      >
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-300/30 bg-violet-300/10 px-3.5 py-1.5 text-xs font-medium text-violet-200 light:border-violet-300 light:bg-violet-100 light:text-violet-700">
          <Sparkles size={12} />
          AI Powered Platform For Content Creators
        </div>

        <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-white light:text-slate-900 md:text-6xl">
          Build once.
          <br />
          <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent light:from-violet-700 light:via-fuchsia-600 light:to-cyan-700">
            Publish everywhere.
          </span>
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-base text-slate-400 light:text-slate-500 md:text-lg">
          XCR8 adapts your content for every platform and audience, keeps your voice consistent, and
          helps you grow with AI-assisted workflows.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/auth/signup"
            className="cta-btn inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-base font-semibold"
          >
            Get Started <ArrowRight size={16} />
          </Link>
          <button
            type="button"
            onClick={() => void handleGoogle()}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3.5 text-base font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700 light:shadow-sm light:hover:bg-slate-50"
          >
            Continue with Google
          </button>
          <Link
            href="/auth/login"
            className="rounded-2xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:text-white light:text-slate-600 light:hover:text-slate-900"
          >
            Log In
          </Link>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            { title: "Unified workspace", text: "Plan, create, and publish in one flow." },
            { title: "AI adaptation", text: "Every post is tailored for each platform." },
            { title: "Premium control", text: "A polished interface built for repeat use." },
          ].map((item) => (
            <div key={item.title} className="surface-soft rounded-2xl p-4 text-left">
              <p className="text-sm font-semibold text-white light:text-slate-900">{item.title}</p>
              <p className="mt-1 text-xs text-slate-400 light:text-slate-600">{item.text}</p>
            </div>
          ))}
        </div>
      </motion.section>
    </main>
  );
}
