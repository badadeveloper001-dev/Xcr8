"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Compass, Layers3, Radar } from "lucide-react";
import { Logo } from "@/components/logo";
import { supabaseClient } from "@/lib/supabase";

export default function WelcomePage() {
  const handleGoogle = async () => {
    if (!supabaseClient) return;
    await supabaseClient.auth.signInWithOAuth({ provider: "google" });
  };

  return (
    <main className="lux-page relative min-h-screen overflow-hidden px-5 py-10 lg:px-10">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_10%_8%,rgba(14,165,233,0.22),transparent_32%),radial-gradient(circle_at_86%_16%,rgba(251,146,60,0.18),transparent_34%),radial-gradient(circle_at_50%_84%,rgba(20,184,166,0.16),transparent_36%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(110deg,rgba(2,6,23,0.96)_12%,rgba(2,6,23,0.8)_44%,rgba(15,23,42,0.7)_100%)] light:bg-[linear-gradient(115deg,rgba(255,255,255,0.94)_14%,rgba(240,249,255,0.9)_52%,rgba(255,251,235,0.9)_100%)]" />

      <div className="mx-auto w-full max-w-6xl">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mb-10 flex items-center justify-between"
      >
        <Logo size="md" className="!w-[220px] max-w-full" />
        <Link
          href="/auth/login"
          className="rounded-xl border border-cyan-200/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20 light:border-slate-200 light:bg-white light:text-slate-700"
        >
          Log In
        </Link>
      </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]"
        >
          <div className="surface-card rounded-[30px] border border-white/10 bg-[rgba(15,23,42,0.66)] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.34)] backdrop-blur md:p-10 light:border-slate-200 light:bg-white/90 light:shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
            <p className="mb-3 inline-flex rounded-full border border-orange-300/35 bg-orange-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-orange-100 light:border-orange-300 light:bg-orange-100 light:text-orange-700">
              Creator command center
            </p>
            <h1 className="max-w-3xl text-4xl font-bold leading-[1.06] tracking-tight text-white light:text-slate-900 md:text-6xl">
              Build next week&apos;s content engine in one focused workspace.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-slate-200 light:text-slate-600 md:text-lg">
              XCR8 helps you capture ideas, shape campaigns, and ship across platforms without
              context switching.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/auth/signup"
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 px-6 py-3.5 text-base font-semibold text-white shadow-[0_14px_34px_rgba(20,184,166,0.38)] transition hover:-translate-y-0.5"
              >
                Create account
                <ArrowRight size={16} />
              </Link>
              <button
                type="button"
                onClick={() => void handleGoogle()}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-base font-medium text-slate-100 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700 light:hover:bg-slate-50"
              >
                Continue with Google
              </button>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Planning", value: "Campaign maps in minutes" },
                { label: "Creation", value: "Assistant-driven drafting" },
                { label: "Distribution", value: "Multi-platform rollout" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 light:border-slate-200 light:bg-slate-50"
                >
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400 light:text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-card cyber-grid rounded-[30px] border border-cyan-200/20 bg-[rgba(15,23,42,0.7)] p-6 light:border-slate-200 light:bg-white/90 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200 light:text-cyan-700">
              Why creators pick XCR8
            </p>
            <div className="mt-4 space-y-3">
              {[
                {
                  title: "Signal-focused briefs",
                  detail: "Spot the strongest content angles before writing a single post.",
                  icon: Compass,
                },
                {
                  title: "Modular workflow stack",
                  detail: "Move from assistant to image and voice tools without losing context.",
                  icon: Layers3,
                },
                {
                  title: "Momentum tracking",
                  detail: "Stay aligned with audience trends and publishing cadence each day.",
                  icon: Radar,
                },
              ].map((item, idx) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + idx * 0.1, duration: 0.35 }}
                  className="surface-soft rounded-2xl p-3.5"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl border border-cyan-300/30 bg-cyan-500/15 p-2 text-cyan-100 light:border-cyan-300 light:bg-cyan-100 light:text-cyan-700">
                      <item.icon size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white light:text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-300 light:text-slate-600">{item.detail}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>
      </div>
    </main>
  );
}
