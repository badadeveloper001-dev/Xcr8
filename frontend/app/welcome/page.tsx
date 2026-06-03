"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { supabaseClient } from "@/lib/supabase";

export default function WelcomePage() {
  const handleGoogle = async () => {
    if (!supabaseClient) return;
    await supabaseClient.auth.signInWithOAuth({ provider: "google" });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-10 lg:px-10">
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
        className="grid gap-5 rounded-[28px] border border-white/10 bg-[rgba(15,23,42,0.34)] p-6 shadow-[0_24px_54px_rgba(15,23,42,0.28)] backdrop-blur md:grid-cols-[1.1fr_0.9fr] md:p-8 light:border-slate-200 light:bg-[rgba(255,255,255,0.84)] light:shadow-[0_18px_32px_rgba(15,23,42,0.08)]"
      >
        <div>
          <p className="mb-3 inline-flex rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200 light:border-cyan-300 light:bg-cyan-100 light:text-cyan-700">
            Creator OS
          </p>
          <h1 className="text-4xl font-bold leading-[1.06] tracking-tight text-white light:text-slate-900 md:text-6xl">
            Plan, create, and publish without the chaos.
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-300 light:text-slate-600 md:text-lg">
            XCR8 keeps your workflow focused: one workspace for strategy, content generation, and distribution.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
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

          <div className="mt-6 grid gap-2 text-sm text-slate-300 light:text-slate-600 sm:grid-cols-2">
            {[
              "One dashboard for your entire content cycle",
              "AI chat tools with focused task pages",
              "Platform-aware drafting and distribution",
              "Built for daily creator workflows",
            ].map((item) => (
              <div key={item} className="inline-flex items-start gap-2">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-cyan-300 light:text-cyan-700" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4 light:border-slate-200 light:bg-slate-50">
          {[
            { label: "Create Faster", value: "3x" },
            { label: "Tool Switching", value: "-62%" },
            { label: "Publishing Flow", value: "One place" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 light:border-slate-200 light:bg-white">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{item.label}</p>
              <p className="mt-1 text-xl font-semibold text-white light:text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="mt-5 grid gap-3 sm:grid-cols-3"
      >
        {[
          { title: "Cr8or Workspace", text: "Strategy and direction in a persistent AI chat." },
          { title: "Composer + Brainstorm", text: "Generate ideas and convert them into publish-ready copy." },
          { title: "Trend + Image Tools", text: "Spot opportunities and generate assets without leaving flow." },
        ].map((item) => (
          <article key={item.title} className="ai-stage p-4">
            <p className="text-sm font-semibold text-white light:text-slate-900">{item.title}</p>
            <p className="mt-1 text-sm text-slate-400 light:text-slate-600">{item.text}</p>
          </article>
        ))}
      </motion.section>
    </main>
  );
}
