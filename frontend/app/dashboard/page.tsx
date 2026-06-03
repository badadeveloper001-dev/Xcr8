"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarClock, ChevronRight, FileText, Sparkles, Zap } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { getDashboardOverview, type DashboardOverviewPayload } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay },
});

const fallbackInsights = [
  {
    title: "Your audience responds best to short hooks",
    detail: "Keep the first sentence under 12 words for stronger retention.",
  },
  {
    title: "Evening windows are your strongest slot",
    detail: "Plan your highest-value posts around 7:30 PM to 9:00 PM.",
  },
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

  const insights = useMemo(() => {
    const items = data?.ai_insights ?? [];
    if (items.length > 0) {
      return items.slice(0, 2).map((item) => ({
        title: item.title,
        detail: item.description,
      }));
    }
    return fallbackInsights;
  }, [data?.ai_insights]);

  const recentPosts = useMemo(() => {
    if (data?.recent_posts?.length) {
      return data.recent_posts.slice(0, 3).map((post) => ({
        id: String(post.post_id),
        title: post.title,
        status: post.status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      }));
    }

    return [
      { id: "r1", title: "This mix will blow your mind!", status: "Published" },
      { id: "r2", title: "Old school vibes never die", status: "Scheduled" },
      { id: "r3", title: "How I build weekly creator flows", status: "Draft" },
    ];
  }, [data?.recent_posts]);

  if (!hasHydrated || !userId) return null;

  const stats = [
    {
      label: "Drafts",
      value: data?.drafts ?? 12,
      icon: FileText,
    },
    {
      label: "Scheduled",
      value: data?.scheduled ?? 8,
      icon: CalendarClock,
    },
    {
      label: "AI Suggestions",
      value: data?.ai_suggestions ?? 0,
      icon: Zap,
    },
  ];

  return (
    <MobileShell title="Dashboard" subtitle="A simpler command view for today.">
      <motion.section {...fadeUp(0)} className="space-y-4">
        <div className="xcr8-panel rounded-2xl border-2 border-cyan-300/30 p-5">
          <p className="xcr8-soft-chip mb-2 inline-flex items-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
            Phase 9 Live
          </p>
          <h1 className="xcr8-title-xl text-white light:text-slate-900">
            Welcome back, {displayName}
          </h1>
          <p className="xcr8-subtle mt-2 max-w-2xl text-sm">
            Start from one of these three actions. Everything else is organized below.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Link
              href="/compose"
              className="cta-btn rounded-xl px-4 py-3 text-center text-sm font-semibold"
            >
              Create Post
            </Link>
            <Link
              href="/calendar"
              className="surface-soft rounded-xl px-4 py-3 text-center text-sm font-semibold text-slate-200 light:text-slate-800"
            >
              Open Calendar
            </Link>
            <Link
              href="/ai-studio/assistant"
              className="surface-soft rounded-xl px-4 py-3 text-center text-sm font-semibold text-slate-200 light:text-slate-800"
            >
              Ask Cr8or AI
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map((item, index) => (
            <motion.article
              key={item.label}
              {...fadeUp(0.04 + index * 0.04)}
              className="xcr8-panel rounded-2xl p-4"
            >
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300 light:bg-violet-100 light:text-violet-700">
                <item.icon size={16} />
              </div>
              <p className="text-2xl font-semibold text-white light:text-slate-900">{item.value}</p>
              <p className="mt-1 text-sm text-slate-400 light:text-slate-600">{item.label}</p>
            </motion.article>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="xcr8-panel rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="xcr8-title-lg text-white light:text-slate-900">Recent Posts</h2>
              <Link
                href="/compose"
                className="text-sm font-medium text-violet-300 light:text-violet-700"
              >
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
                    <p className="text-sm font-semibold text-white light:text-slate-900">
                      {post.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 light:text-slate-600">
                      {post.status}
                    </p>
                  </div>
                  <ChevronRight size={15} className="text-slate-500" />
                </button>
              ))}
            </div>
          </section>

          <section className="xcr8-panel rounded-2xl p-4">
            <h2 className="xcr8-title-lg mb-3 flex items-center gap-2 text-white light:text-slate-900">
              <Sparkles size={16} className="text-cyan-300" />
              Today with AI
            </h2>
            <div className="space-y-2.5">
              {insights.map((insight) => (
                <article key={insight.title} className="surface-soft rounded-xl px-3 py-3">
                  <p className="text-sm font-semibold text-white light:text-slate-900">
                    {insight.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 light:text-slate-600">
                    {insight.detail}
                  </p>
                </article>
              ))}
            </div>
            <Link
              href="/analytics"
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-slate-200 light:border-slate-200 light:bg-white light:text-slate-700"
            >
              Open Analytics
            </Link>
          </section>
        </div>
      </motion.section>
    </MobileShell>
  );
}
