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
          AI Studio
        </div>
        <h2 className="xcr8-title-xl max-w-2xl text-white light:text-slate-900">
          Pick a tool and start.
        </h2>
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
            Plan with AI chat.
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
            Create
          </h3>
          <p className="xcr8-subtle mt-2 text-sm">Composer, Brainstorm, and Image Generator.</p>
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
          <p className="xcr8-subtle mt-2 text-sm">Trend Mapper and Voiceover.</p>
        </motion.section>
      </div>
    </StudioShell>
  );
}
