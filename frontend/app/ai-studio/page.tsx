"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ImagePlus, Mic2, Sparkles, Wand2 } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";

const tools = [
  {
    title: "Artwork Generator",
    desc: "Generate visual assets aligned with your creator brand.",
    icon: ImagePlus,
    href: "/compose?mode=art",
  },
  {
    title: "AI Voiceover",
    desc: "Turn scripts into creator-style narration.",
    icon: Mic2,
    href: "/compose?mode=voice",
  },
  {
    title: "Prompt Lab",
    desc: "Craft concepts, scripts, hooks, and campaign variations.",
    icon: Wand2,
    href: "/compose?mode=prompts",
  },
];

export default function AIStudioPage() {
  return (
    <MobileShell title="AI Studio" subtitle="Creative intelligence tools for your content engine.">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="surface-luxe cyber-grid scanline rounded-2xl p-4"
      >
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
          <Sparkles size={12} />
          AI-native creator tooling
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <article key={tool.title} className="surface-soft rounded-xl p-3">
                <span className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-violet-500/20 text-violet-300 light:bg-violet-100 light:text-violet-700">
                  <Icon size={16} />
                </span>
                <h2 className="text-sm font-semibold text-white light:text-slate-900">
                  {tool.title}
                </h2>
                <p className="mt-1 text-xs text-slate-500">{tool.desc}</p>
                <Link
                  href={tool.href}
                  className="mt-3 inline-flex text-xs font-medium text-violet-400 hover:underline light:text-violet-700"
                >
                  Open tool
                </Link>
              </article>
            );
          })}
        </div>
      </motion.section>
    </MobileShell>
  );
}
