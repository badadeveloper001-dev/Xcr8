"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Compass, MessageSquareQuote, Stars, Workflow } from "lucide-react";
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
        className="xcr8-panel mb-5 overflow-hidden p-6"
      >
        <div className="xcr8-soft-chip mb-3 inline-flex items-center gap-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em]">
          <Stars size={12} />
          Creator Command Deck
        </div>
        <h2 className="xcr8-title-xl max-w-2xl text-white light:text-slate-900">
          Build, test, and ship creative outputs from one branded studio flow.
        </h2>
        <p className="xcr8-subtle mt-2 max-w-2xl text-sm sm:text-base">
          Pick any tool in the shelf to open a fresh workspace page with focused controls, cleaner
          previews, and faster output iteration.
        </p>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="xcr8-panel p-5"
        >
          <p className="xcr8-eyebrow mb-2 inline-flex items-center gap-2">
            <Workflow size={13} />
            Workflow Standard
          </p>
          <h3 className="xcr8-title-lg text-white light:text-slate-900">
            Every tool now opens as its own route-first workspace
          </h3>
          <div className="mt-4 grid gap-2 text-sm">
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
          className="xcr8-panel p-5"
        >
          <p className="xcr8-eyebrow mb-2 inline-flex items-center gap-2">
            <Compass size={13} />
            Quick Start
          </p>
          <h3 className="xcr8-title-lg text-white light:text-slate-900">Start with Cr8or AI</h3>
          <p className="xcr8-subtle mt-2 text-sm">
            Ask Cr8or AI anything about the app, your content, or your next move.
          </p>
          <Link
            href="/ai-studio/assistant"
            className="cta-btn mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            Open Cr8or AI
            <ArrowRight size={15} />
          </Link>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-[11px] font-medium text-indigo-200 light:border-indigo-300 light:bg-indigo-100 light:text-indigo-700">
            <MessageSquareQuote size={11} />
            Built for real creator conversations
          </div>
        </motion.section>
      </div>
    </StudioShell>
  );
}
