"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { ArrowRight, Cpu, Globe2, LayoutGrid, Repeat2, Sparkles, Zap } from "lucide-react";
import { Logo } from "@/components/logo";

type HealthResponse = { status: string; service: string };
const getHealth = async (): Promise<HealthResponse> => {
  const { data } = await apiClient.get<HealthResponse>("/api/v1/health");
  return data;
};

const features = [
  {
    icon: <Cpu size={20} />,
    label: "AI Caption Adaptation",
    desc: "One caption → perfectly adapted text for every platform and language.",
    color: "from-violet-500/20 to-purple-600/10",
    iconColor: "text-violet-400",
  },
  {
    icon: <Globe2 size={20} />,
    label: "Multilingual",
    desc: "English, Yoruba, Nigerian Pidgin, and code-switch — all auto-generated.",
    color: "from-fuchsia-500/20 to-pink-600/10",
    iconColor: "text-fuchsia-400",
  },
  {
    icon: <LayoutGrid size={20} />,
    label: "Multi-Platform",
    desc: "IG, TikTok, X, LinkedIn, Facebook, Threads — one workflow rules them all.",
    color: "from-blue-500/20 to-indigo-600/10",
    iconColor: "text-blue-400",
  },
  {
    icon: <Repeat2 size={20} />,
    label: "Smart Scheduling",
    desc: "Post at peak times with timezone-aware intelligent scheduling.",
    color: "from-emerald-500/20 to-teal-600/10",
    iconColor: "text-emerald-400",
  },
  {
    icon: <Sparkles size={20} />,
    label: "Creator Memory",
    desc: "Xcr8 learns your tone, emoji style, and slang — gets sharper over time.",
    color: "from-amber-500/20 to-orange-600/10",
    iconColor: "text-amber-400",
  },
  {
    icon: <Zap size={20} />,
    label: "Analytics Intelligence",
    desc: "Performance insights that actually tell you what to post next.",
    color: "from-rose-500/20 to-pink-600/10",
    iconColor: "text-rose-400",
  },
];

const platforms = ["IG", "TK", "X", "LI", "FB", "YT", "TH"];
const platformColors = [
  "badge-ig",
  "badge-tk",
  "badge-x",
  "badge-li",
  "badge-fb",
  "badge-yt",
  "badge-th",
];

export default function Home() {
  const { data } = useQuery({ queryKey: ["health"], queryFn: getHealth });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-12 lg:px-10">
      {/* Nav-like top bar */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-14 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Logo size="md" className="!w-[220px] max-w-full" />
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/auth/login"
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 transition hover:text-white light:text-slate-600 light:hover:text-slate-900"
          >
            Sign in
          </Link>
          <Link href="/auth/signup" className="cta-btn rounded-xl px-4 py-2 text-sm font-semibold">
            Get started
          </Link>
        </div>
      </motion.header>

      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.1 }}
        className="mb-16 text-center"
      >
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1.5 text-xs font-medium text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
          <Sparkles size={12} />
          AI-first creator operating system · Built for Nigerian creators
        </div>

        <h1 className="text-5xl font-bold leading-[1.08] tracking-tight text-white light:text-slate-900 md:text-6xl lg:text-7xl">
          Upload once.
          <br />
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400 bg-clip-text text-transparent">
            Reach everywhere.
          </span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-base text-slate-400 light:text-slate-500 md:text-lg">
          Xcr8 adapts your captions for every platform and language, schedules at peak times, and
          learns your creative voice — so you can focus on creating.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/auth/signup"
            className="cta-btn inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-base font-semibold"
          >
            Start for free <ArrowRight size={16} />
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3.5 text-base font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700 light:shadow-sm light:hover:bg-slate-50"
          >
            Open Dashboard
          </Link>
        </div>

        {/* Platform badges row */}
        <div className="mt-10 flex items-center justify-center gap-2.5">
          <span className="text-xs text-slate-500 light:text-slate-400">Distribute to:</span>
          {platforms.map((p, i) => (
            <span
              key={p}
              className={`grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white ${platformColors[i]}`}
            >
              {p}
            </span>
          ))}
          <span className="text-xs text-slate-500 light:text-slate-400">& more</span>
        </div>
      </motion.section>

      {/* Status bar */}
      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mb-10 flex items-center justify-center gap-2 text-xs text-slate-500 light:text-slate-400"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          API {data.status} · {data.service}
        </motion.div>
      )}

      {/* Feature grid */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 light:text-slate-400">
          Everything a creator needs
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feat) => (
            <article
              key={feat.label}
              className={`surface-card rounded-2xl bg-gradient-to-br p-4 ${feat.color}`}
            >
              <span className={`mb-3 inline-block ${feat.iconColor}`}>{feat.icon}</span>
              <h3 className="mb-1 text-base font-semibold text-white light:text-slate-900">
                {feat.label}
              </h3>
              <p className="text-sm text-slate-400 light:text-slate-500">{feat.desc}</p>
            </article>
          ))}
        </div>
      </motion.section>

      {/* Footer CTA strip */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-14 text-center"
      >
        <p className="text-sm text-slate-500 light:text-slate-400">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="font-medium text-violet-400 hover:underline light:text-violet-600"
          >
            Sign in
          </Link>
        </p>
      </motion.div>
    </main>
  );
}
