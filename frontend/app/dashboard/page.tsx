"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, CalendarClock, CheckCircle2, FileText, Sparkles, Zap } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { getDashboardOverview, type DashboardOverviewPayload } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.32, delay },
});

const fallbackFocus = [
  "Polish one post and schedule it today.",
  "Use Cr8or AI for one new caption variation.",
  "Review analytics for one actionable insight.",
];

export default function DashboardPage() {
  const router = useRouter();
  const hasHydrated = useCreatorStore((s) => s.hasHydrated);
  const userId = useCreatorStore((s) => s.userId);
  const displayName = useCreatorStore((s) => s.displayName) ?? "Creator";

  useEffect(() => {
    if (hasHydrated && !userId) router.replace("/auth/login");
  }, [hasHydrated, router, userId]);

  const { data } = useQuery<DashboardOverviewPayload, Error>({
    queryKey: ["dashboard", userId],
    queryFn: () => getDashboardOverview(userId as number),
    enabled: Boolean(userId),
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  const focusList = useMemo(() => {
    const insights = data?.ai_insights ?? [];
    if (insights.length === 0) {
      return fallbackFocus;
    }
    return insights.slice(0, 3).map((item) => item.title);
  }, [data?.ai_insights]);

  const quickStats = [
    { label: "Drafts", value: data?.drafts ?? 12, icon: FileText },
    { label: "Scheduled", value: data?.scheduled ?? 8, icon: CalendarClock },
    { label: "AI Suggestions", value: data?.ai_suggestions ?? 0, icon: Zap },
  ];

  const recentPosts = useMemo(() => {
    if (data?.recent_posts?.length) {
      return data.recent_posts.slice(0, 4).map((post) => ({
        id: String(post.post_id),
        title: post.title,
        status: post.status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      }));
    }

    return [
      { id: "p1", title: "This mix will blow your mind!", status: "Published" },
      { id: "p2", title: "Old school vibes never die", status: "Scheduled" },
      { id: "p3", title: "How I build weekly creator flows", status: "Draft" },
      { id: "p4", title: "Afrobeats carousel concept", status: "Draft" },
    ];
  }, [data?.recent_posts]);

  if (!hasHydrated || !userId) return null;

  return (
    <MobileShell title="Dashboard" subtitle="Clear plan. Fast execution.">
      <div className="space-y-4">
        <motion.section {...fadeUp(0)} className="xcr8-panel rounded-2xl border-2 border-cyan-300/30 p-5">
          <p className="xcr8-soft-chip mb-2 inline-flex items-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
            Elevated Flow
          </p>
          <h1 className="xcr8-title-xl text-white light:text-slate-900">Good to see you, {displayName}</h1>
          <p className="xcr8-subtle mt-2 max-w-2xl text-sm">
            Everything important is reduced to one simple sequence: pick your next action, execute, then review progress.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Link href="/compose" className="cta-btn rounded-xl px-4 py-3 text-center text-sm font-semibold">
              Start New Post
            </Link>
            <Link href="/calendar" className="surface-soft rounded-xl px-4 py-3 text-center text-sm font-semibold text-slate-200 light:text-slate-800">
              Check Schedule
            </Link>
            <Link href="/ai-studio/assistant" className="surface-soft rounded-xl px-4 py-3 text-center text-sm font-semibold text-slate-200 light:text-slate-800">
              Open Cr8or AI
            </Link>
          </div>
        </motion.section>

        <motion.section {...fadeUp(0.05)} className="grid gap-3 sm:grid-cols-3">
          {quickStats.map((item) => (
            <article key={item.label} className="xcr8-panel rounded-2xl p-4">
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300 light:bg-violet-100 light:text-violet-700">
                <item.icon size={16} />
              </div>
              <p className="text-2xl font-semibold text-white light:text-slate-900">{item.value}</p>
              <p className="mt-1 text-sm text-slate-500 light:text-slate-600">{item.label}</p>
            </article>
          ))}
        </motion.section>

        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <motion.section {...fadeUp(0.09)} className="xcr8-panel rounded-2xl p-4">
            <h2 className="xcr8-title-lg mb-3 flex items-center gap-2 text-white light:text-slate-900">
              <Sparkles size={16} className="text-cyan-300" />
              Your Focus Today
            </h2>
            <div className="space-y-2.5">
              {focusList.map((item) => (
                <div key={item} className="surface-soft flex items-start gap-2.5 rounded-xl px-3 py-3">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />
                  <p className="text-sm text-slate-200 light:text-slate-800">{item}</p>
                </div>
              ))}
            </div>
            <Link
              href="/analytics"
              className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-slate-200 light:border-slate-200 light:bg-white light:text-slate-700"
            >
              Open full insights
              <ArrowRight size={14} />
            </Link>
          </motion.section>

          <motion.section {...fadeUp(0.12)} className="xcr8-panel rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="xcr8-title-lg text-white light:text-slate-900">Continue Working</h2>
              <Link href="/compose" className="text-sm font-medium text-violet-300 light:text-violet-700">
                View all
              </Link>
            </div>
            <div className="space-y-2.5">
              {recentPosts.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => router.push("/compose")}
                  className="surface-soft flex w-full items-center justify-between rounded-xl px-3 py-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-white light:text-slate-900">{post.title}</p>
                    <p className="mt-1 text-xs text-slate-500 light:text-slate-600">{post.status}</p>
                  </div>
                  <ArrowRight size={14} className="text-slate-500" />
                </button>
              ))}
            </div>
          </motion.section>
        </div>
      </div>
    </MobileShell>
  );
}
