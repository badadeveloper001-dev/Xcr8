"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarClock,
  FileText,
  ImageIcon,
  PenSquare,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/logo";
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
    {
      label: "Drafts",
      value: data?.drafts ?? 12,
      icon: FileText,
      accent: "bg-cyan-500/15 text-cyan-300 light:bg-[#6E16F2] light:text-white",
    },
    {
      label: "Scheduled",
      value: data?.scheduled ?? 8,
      icon: CalendarClock,
      accent: "bg-violet-500/15 text-violet-300 light:bg-[#6E16F2] light:text-white",
    },
    {
      label: "AI Suggestions",
      value: data?.ai_suggestions ?? 0,
      icon: Zap,
      accent: "bg-amber-500/15 text-amber-300 light:bg-[#6E16F2] light:text-white",
    },
    {
      label: "In Motion",
      value: (data?.drafts ?? 0) + (data?.scheduled ?? 0),
      icon: TrendingUp,
      accent: "bg-emerald-500/15 text-emerald-300 light:bg-[#6E16F2] light:text-white",
    },
  ];

  const quickActions = [
    {
      title: "Composer",
      subtitle: "Draft a post",
      href: "/ai-studio/composer",
      icon: PenSquare,
      accent: "bg-cyan-500/15 text-cyan-300 light:bg-[#6E16F2] light:text-white",
    },
    {
      title: "Image AI",
      subtitle: "Generate visuals",
      href: "/ai-studio/image-generator",
      icon: ImageIcon,
      accent: "bg-rose-500/15 text-rose-300 light:bg-[#6E16F2] light:text-white",
    },
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
    <MobileShell hideHeader>
      <div className="space-y-4">
        <motion.section
          {...fadeUp(0)}
          className="xcr8-panel rounded-2xl border-2 border-cyan-300/30 p-5"
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Logo size="sm" className="logo-breathe origin-left" />
              <Link
                href="/compose"
                className="cta-btn rounded-xl px-4 py-2.5 text-sm font-semibold"
              >
                New Post
              </Link>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-300 light:text-slate-700">
              Welcome back, {displayName}
            </p>
          </div>

          <div className="mt-4 grid gap-2 grid-cols-2 sm:grid-cols-4">
            {quickStats.map((item) => (
              <article key={`mini-${item.label}`} className="surface-soft rounded-xl px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</p>
                <p className="mt-1 text-lg font-semibold text-white light:text-slate-900">
                  {item.value}
                </p>
              </article>
            ))}
          </div>
        </motion.section>

        <motion.section {...fadeUp(0.08)} className="xcr8-panel rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="xcr8-title-lg text-white light:text-slate-900">Quick Actions</h2>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-cyan-300" />
              <Link
                href="/ai-studio"
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700 light:hover:bg-slate-50"
              >
                See all tools
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.title}
                href={action.href}
                className="surface-soft rounded-xl px-3 py-3 transition hover:bg-white/10 light:hover:bg-white"
              >
                <div
                  className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg ${action.accent}`}
                >
                  <action.icon size={16} />
                </div>
                <p className="text-sm font-semibold text-white light:text-slate-900">
                  {action.title}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 light:text-slate-600">
                  {action.subtitle}
                </p>
              </Link>
            ))}
          </div>
        </motion.section>

        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <motion.section {...fadeUp(0.09)} className="xcr8-panel rounded-2xl p-4">
            <h2 className="xcr8-title-lg mb-3 flex items-center gap-2 text-white light:text-slate-900">
              <Sparkles size={16} className="text-cyan-300" />
              Your Focus Today
            </h2>
            <div className="grid gap-2.5">
              {focusList.map((item, index) => (
                <div
                  key={item}
                  className="surface-soft flex items-center gap-3 rounded-xl px-3 py-3"
                >
                  <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-xs font-semibold text-emerald-300 light:bg-emerald-100 light:text-emerald-700">
                    {index + 1}
                  </div>
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
                    <div className="mt-1 inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400 light:border-slate-200 light:bg-slate-50 light:text-slate-600">
                      {post.status}
                    </div>
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
