"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Compass,
  Image,
  MessageSquareQuote,
  Mic2,
  Stars,
  Workflow,
} from "lucide-react";
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
        className="xcr8-panel mb-5 overflow-hidden border-2 border-cyan-300/30 p-6"
      >
        <div className="xcr8-soft-chip mb-3 inline-flex items-center gap-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em]">
          <Stars size={12} />
          Studio Focus Mode
        </div>
        <h2 className="xcr8-title-xl max-w-2xl text-white light:text-slate-900">
          Pick a creation lane and move from idea to output in minutes.
        </h2>
        <p className="xcr8-subtle mt-2 max-w-2xl text-sm sm:text-base">
          AI Studio is now organized by intent: planning, writing, and production. No clutter,
          just clear next actions.
        </p>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-3">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="xcr8-panel p-5"
        >
          <p className="xcr8-eyebrow mb-2 inline-flex items-center gap-2">
            <MessageSquareQuote size={13} />
            Plan
          </p>
          <h3 className="xcr8-title-lg text-white light:text-slate-900">Cr8or Workspace</h3>
          <p className="xcr8-subtle mt-2 text-sm">
            Brainstorm direction, ask questions, and refine strategy with your persistent workspace
            memory.
          </p>
          <Link
            href="/ai-studio/assistant"
            className="cta-btn mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            Open workspace
            <ArrowRight size={15} />
          </Link>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.12 }}
          className="xcr8-panel p-5"
        >
          <p className="xcr8-eyebrow mb-2 inline-flex items-center gap-2">
            <Image size={13} />
            Create
          </p>
          <h3 className="xcr8-title-lg text-white light:text-slate-900">
            Generate visual and written assets faster
          </h3>
          <div className="mt-4 grid gap-2 text-sm text-slate-300 light:text-slate-700">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 light:border-slate-200 light:bg-white/70">
              Use Composer for multi-platform caption variants.
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 light:border-slate-200 light:bg-white/70">
              Use Image Generator for visual concepts and prompts.
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.16 }}
          className="xcr8-panel border-2 border-indigo-300/30 p-5"
        >
          <p className="xcr8-eyebrow mb-2 inline-flex items-center gap-2">
            <Mic2 size={13} />
            Produce
          </p>
          <h3 className="xcr8-title-lg text-white light:text-slate-900">Turn ideas into final outputs</h3>
          <p className="xcr8-subtle mt-2 text-sm">
            Move from plan to voiceover, trend mapping, and export without bouncing across
            unrelated screens.
          </p>
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-slate-300 light:border-slate-200 light:bg-white/70 light:text-slate-700">
            Tip: Start in Cr8or Workspace, then open one tool at a time from the shelf for a
            cleaner, faster session.
          </div>
        </motion.section>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.2 }}
        className="xcr8-panel mt-4 rounded-2xl p-4"
      >
        <p className="xcr8-eyebrow mb-2 inline-flex items-center gap-2">
          <Workflow size={13} />
          Workflow Path
        </p>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="surface-soft rounded-xl px-3 py-2.5">1. Plan in Cr8or Workspace</div>
          <div className="surface-soft rounded-xl px-3 py-2.5">2. Create with focused tools</div>
          <div className="surface-soft rounded-xl px-3 py-2.5">3. Ship to Compose/Calendar</div>
        </div>
      </motion.section>
    </StudioShell>
  );
}
