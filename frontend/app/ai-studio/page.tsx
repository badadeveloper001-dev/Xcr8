"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Compass, Sparkles, Stars, Workflow } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";

export default function AIStudioPage() {
  return (
    <StudioShell
      title="AI Studio"
      subtitle="Launch premium AI workflows in dedicated creator workspaces."
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="mb-4 overflow-hidden rounded-3xl border border-indigo-400/30 bg-gradient-to-br from-indigo-900/80 via-blue-900/65 to-cyan-900/65 p-5 shadow-[0_18px_50px_-28px_rgba(56,189,248,0.6)] light:border-indigo-200 light:from-white light:via-indigo-50 light:to-cyan-50"
      >
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-cyan-200 light:border-cyan-200 light:bg-cyan-100 light:text-cyan-700">
          <Stars size={12} />
          Creator Command Deck
        </div>
        <h2 className="max-w-2xl text-2xl font-bold leading-tight text-white light:text-slate-900 sm:text-3xl">
          Build, test, and ship creative outputs from one branded studio flow.
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-cyan-100/90 light:text-slate-600 sm:text-base">
          Pick any tool in the shelf to open a fresh workspace page with focused controls, cleaner
          previews, and faster output iteration.
        </p>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="surface-soft rounded-3xl p-5"
        >
          <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Workflow size={13} />
            Workflow Standard
          </p>
          <h3 className="text-lg font-semibold text-white light:text-slate-900 sm:text-xl">
            Every tool now opens as its own route-first workspace
          </h3>
          <div className="mt-4 grid gap-2 text-sm text-slate-300 light:text-slate-700">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 light:border-slate-200 light:bg-white/70">
              1. Choose a tool in the shelf above
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 light:border-slate-200 light:bg-white/70">
              2. Land on a focused page for that tool only
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 light:border-slate-200 light:bg-white/70">
              3. Generate, refine, and export without context switching
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.14 }}
          className="surface-soft rounded-3xl p-5"
        >
          <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Compass size={13} />
            Quick Start
          </p>
          <h3 className="text-lg font-semibold text-white light:text-slate-900">Start with Image Generator</h3>
          <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
            Generate premium visual outputs first, then move to Composer or Brainstorm for post
            copy and rollout.
          </p>
          <Link
            href="/ai-studio/image-generator"
            className="cta-btn mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            Open Image Generator
            <ArrowRight size={15} />
          </Link>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-[11px] font-medium text-indigo-200 light:border-indigo-300 light:bg-indigo-100 light:text-indigo-700">
            <Sparkles size={11} />
            Built for real production workflows
          </div>
        </motion.section>
      </div>
    </StudioShell>
  );
}
