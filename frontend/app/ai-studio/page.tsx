"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Bot, Brain, Mic, ImagePlus, PenLine, TrendingUp, Zap } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { useCreatorStore } from "@/lib/store";

const tools = [
  {
    id: "assistant",
    href: "/ai-studio/assistant",
    icon: Bot,
    label: "Cr8or AI",
    desc: "Your personal AI workspace. Ask anything, plan content, get strategic advice.",
    accent: "from-violet-600/20 to-violet-500/5 border-violet-500/30",
    chip: "bg-violet-500/15 text-violet-300 light:bg-violet-100 light:text-violet-700",
    badge: "Core",
  },
  {
    id: "composer",
    href: "/ai-studio/composer",
    icon: PenLine,
    label: "Caption Composer",
    desc: "Write one master caption and Xcr8 adapts it across every platform automatically.",
    accent: "from-cyan-600/20 to-cyan-500/5 border-cyan-500/30",
    chip: "bg-cyan-500/15 text-cyan-300 light:bg-cyan-100 light:text-cyan-700",
    badge: "Popular",
  },
  {
    id: "brainstorm",
    href: "/ai-studio/brainstorm",
    icon: Brain,
    label: "Brainstorm",
    desc: "Generate a full batch of content ideas with hooks, CTAs, and angles in seconds.",
    accent: "from-emerald-600/20 to-emerald-500/5 border-emerald-500/30",
    chip: "bg-emerald-500/15 text-emerald-300 light:bg-emerald-100 light:text-emerald-700",
    badge: null,
  },
  {
    id: "image-generator",
    href: "/ai-studio/image-generator",
    icon: ImagePlus,
    label: "Image Generator",
    desc: "Create one studio-quality HD image from a description. Cinematic, editorial, or documentary.",
    accent: "from-rose-600/20 to-rose-500/5 border-rose-500/30",
    chip: "bg-rose-500/15 text-rose-300 light:bg-rose-100 light:text-rose-700",
    badge: "HD",
  },
  {
    id: "trend-mapper",
    href: "/ai-studio/trend-mapper",
    icon: TrendingUp,
    label: "Trend Mapper",
    desc: "Map live signals, angles, and hooks for any topic across any platform.",
    accent: "from-amber-600/20 to-amber-500/5 border-amber-500/30",
    chip: "bg-amber-500/15 text-amber-300 light:bg-amber-100 light:text-amber-700",
    badge: null,
  },
  {
    id: "voiceover",
    href: "/ai-studio/voiceover",
    icon: Mic,
    label: "Voiceover",
    desc: "Turn any script into a natural-sounding voiceover ready for your videos.",
    accent: "from-fuchsia-600/20 to-fuchsia-500/5 border-fuchsia-500/30",
    chip: "bg-fuchsia-500/15 text-fuchsia-300 light:bg-fuchsia-100 light:text-fuchsia-700",
    badge: null,
  },
  {
    id: "intelligence",
    href: "/ai-studio/intelligence",
    icon: Zap,
    label: "Intelligence Feed",
    desc: "Personalised trend signals, opportunity scores, and audience momentum updates.",
    accent: "from-sky-600/20 to-sky-500/5 border-sky-500/30",
    chip: "bg-sky-500/15 text-sky-300 light:bg-sky-100 light:text-sky-700",
    badge: "Live",
  },
] as const;

export default function AIStudioPage() {
  const router = useRouter();
  const hasHydrated = useCreatorStore((s) => s.hasHydrated);
  const userId = useCreatorStore((s) => s.userId);

  useEffect(() => {
    if (hasHydrated && !userId) router.replace("/auth/login");
  }, [hasHydrated, router, userId]);

  if (!hasHydrated || !userId) return null;

  return (
    <MobileShell title="AI Studio" subtitle="All your AI tools in one place.">
      <div className="space-y-4">
        {/* Hero strip */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="xcr8-panel rounded-2xl border-2 border-violet-500/20 bg-gradient-to-br from-violet-600/10 via-transparent to-transparent p-5"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-400 light:text-violet-600">
            Xcr8 Intelligence
          </p>
          <h1 className="xcr8-title-xl mt-1 text-white light:text-slate-900">AI Studio</h1>
          <p className="mt-1.5 max-w-md text-sm text-slate-400 light:text-slate-600">
            Seven specialised tools. One workspace. Build, create, and grow faster.
          </p>
          <Link
            href="/ai-studio/assistant"
            className="cta-btn mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            <Bot size={15} />
            Open Cr8or AI
          </Link>
        </motion.section>

        {/* Tool grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {tools.map((tool, i) => (
            <motion.div
              key={tool.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.04 + i * 0.04 }}
            >
              <Link
                href={tool.href}
                className={`group block h-full rounded-2xl border bg-gradient-to-br p-4 transition hover:scale-[1.01] hover:shadow-lg ${tool.accent}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tool.chip}`}
                  >
                    <tool.icon size={17} />
                  </div>
                  {tool.badge ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tool.chip}`}
                    >
                      {tool.badge}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm font-semibold text-white light:text-slate-900">
                  {tool.label}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400 light:text-slate-600">
                  {tool.desc}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </MobileShell>
  );
}
