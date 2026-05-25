"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarClock,
  MessageSquare,
  Mic,
  Paintbrush,
  Radio,
  TrendingUp,
  Upload,
  Wand2,
} from "lucide-react";
import { motion } from "framer-motion";
import { MobileShell } from "@/components/mobile-shell";
import { getDashboardOverview } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
});

const quickActions = [
  { label: "Upload Content", href: "/upload", icon: Upload },
  { label: "Write a Post", href: "/compose", icon: Wand2 },
  { label: "Create an Image", href: "/ai-studio?tab=art", icon: Paintbrush },
  { label: "Record Voice", href: "/ai-studio?tab=audio", icon: Mic },
  { label: "Add Narration", href: "/ai-studio?tab=voice", icon: MessageSquare },
  { label: "Plan a Live Session", href: "/calendar?mode=live", icon: Radio },
] as const;

const fallbackTrendRadar = [
  { title: "Afrobeats challenge clips", metric: "Rising 34%", tag: "Trending sound" },
  { title: "POV mini-story format", metric: "Rising 22%", tag: "Viral format" },
  { title: "#WeekendVibesNG", metric: "Rising 41%", tag: "Hashtag" },
];

export default function DashboardPage() {
  const router = useRouter();
  const userId = useCreatorStore((s) => s.userId);
  const displayName = useCreatorStore((s) => s.displayName) ?? "Creator";
  useEffect(() => {
    if (!userId) router.replace("/auth/login");
  }, [router, userId]);

  const { data } = useQuery({
    queryKey: ["dashboard", userId],
    queryFn: () => getDashboardOverview(userId as number),
    enabled: Boolean(userId),
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  const dynamicGreeting = useMemo(() => {
    if ((data?.ai_suggestions ?? 0) >= 6) return "You have several ready-to-publish drafts.";
    if ((data?.platforms_connected ?? 0) >= 4) return "Your connected apps are synced and ready.";
    if ((data?.scheduled ?? 0) >= 3) return "You already have a good posting plan for today.";
    return "Everything is set up. Start with your top task below.";
  }, [data?.ai_suggestions, data?.platforms_connected, data?.scheduled]);

  const snapshotCards = useMemo(
    () => [
      {
        label: "Drafts ready",
        value: data?.drafts ?? 12,
        note: "ready to edit",
      },
      {
        label: "Scheduled today",
        value: data?.scheduled ?? 2,
        note: "planned posts",
      },
      {
        label: "Connected apps",
        value: data?.platforms_connected ?? 3,
        note: "active channels",
      },
    ],
    [data?.drafts, data?.platforms_connected, data?.scheduled],
  );

  const insightCards = useMemo(
    () =>
      data?.ai_insights?.length
        ? data.ai_insights.map((item, index) => ({
            title: item.title,
            metric: `Signal ${index + 1}`,
            tag: item.description,
          }))
        : fallbackTrendRadar,
    [data?.ai_insights],
  );

  const recentPosts = useMemo(() => {
    if (data?.recent_posts?.length) {
      return data.recent_posts.map((post) => ({
        id: String(post.post_id),
        label: post.title,
        time: "Recently",
        status: post.status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      }));
    }

    return [
      { id: "t1", label: "IG Reel", time: "5:00 PM", status: "Scheduled" },
      { id: "t2", label: "TikTok Clip", time: "7:30 PM", status: "AI Recommended" },
      { id: "t3", label: "X Thread", time: "9:00 PM", status: "Draft" },
    ];
  }, [data?.recent_posts]);

  if (!userId) return null;

  return (
    <MobileShell hideHeader>
      <motion.section {...fadeUp(0)} className="-mx-4 mb-4 sm:mx-0 sm:mb-5">
        <div className="relative w-full rounded-[28px] border border-violet-400/25 bg-gradient-to-br from-violet-900/80 via-violet-700/80 to-fuchsia-700/80 p-[1px] shadow-[0_18px_55px_-30px_rgba(139,92,246,0.7)] before:absolute before:inset-0 before:-z-10 before:animate-pulse before:bg-[radial-gradient(circle_at_60%_10%,rgba(236,72,153,0.18),transparent_40%),radial-gradient(circle_at_20%_80%,rgba(139,92,246,0.22),transparent_40%)] sm:mx-auto sm:max-w-2xl sm:rounded-[28px] sm:border-2 sm:border-transparent sm:p-[2px]">
          <div className="rounded-[26px] bg-gradient-to-br from-violet-950/90 via-violet-900/80 to-fuchsia-900/80 px-4 py-5 sm:rounded-[26px] sm:p-8 light:from-white light:via-violet-50 light:to-fuchsia-50">
            <div className="mb-4 flex flex-col items-center justify-center gap-2 text-center">
              <img
                src="/XCR8.svg"
                alt="Xcr8 logo"
                className="mb-1 h-auto w-52 max-w-full sm:w-64 light:brightness-0 light:contrast-125"
                draggable={false}
              />
              <p className="section-kicker mb-1 mt-2 text-violet-300 light:text-violet-700">
                Today at a glance
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(139,92,246,0.25)] light:text-slate-900">
                Welcome back, {displayName}
              </h1>
              <p className="mt-2 max-w-[38ch] text-base text-slate-300 light:text-slate-600">
                {dynamicGreeting}
              </p>
            </div>

            <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/compose"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 px-4 py-2 text-base font-bold text-white shadow-md transition hover:scale-105 hover:from-fuchsia-400 hover:to-violet-400 light:from-fuchsia-400 light:via-violet-300 light:to-indigo-300"
              >
                Create post
                <ArrowUpRight size={17} />
              </Link>
              <Link
                href="/calendar"
                className="inline-flex items-center gap-2 rounded-xl border border-violet-400/30 bg-white/10 px-4 py-2 text-base font-semibold text-violet-100 shadow-md transition hover:border-amber-300/40 hover:bg-amber-400/10 hover:text-amber-200 light:border-violet-200 light:bg-white light:text-violet-700 light:hover:border-amber-200 light:hover:bg-amber-50"
              >
                View schedule
                <CalendarClock size={17} />
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {snapshotCards.map((card) => (
                <div
                  key={card.label}
                  className="surface-soft rounded-xl border border-violet-400/20 bg-violet-900/40 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md light:border-violet-200 light:bg-white/80"
                >
                  <p className="text-[11px] uppercase tracking-[0.13em] text-violet-300 light:text-violet-700">
                    {card.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-white light:text-slate-900">
                    {card.value}
                  </p>
                  <p className="text-xs text-violet-200 light:text-violet-700">{card.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section {...fadeUp(0.03)} className="mb-4 sm:mb-5">
        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white light:text-slate-900">Quick Actions</h2>
            <span className="text-xs text-slate-500">Start in one tap</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="surface-soft group flex items-center gap-3 rounded-xl border border-white/10 p-3 transition hover:-translate-y-0.5 hover:border-violet-300/40 light:border-slate-200"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200 light:bg-violet-100 light:text-violet-700">
                  <action.icon size={18} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white light:text-slate-900">
                    {action.label}
                  </p>
                  <p className="text-xs text-slate-400 light:text-slate-600">Jump in now</p>
                </div>
                <ArrowUpRight
                  size={14}
                  className="text-slate-500 transition group-hover:text-violet-200 light:group-hover:text-violet-700"
                />
              </Link>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section {...fadeUp(0.06)} className="mb-4 grid gap-4 sm:mb-5 lg:grid-cols-2">
        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-violet-200 light:text-violet-700" />
            <h2 className="text-lg font-bold text-white light:text-slate-900">AI Insights</h2>
          </div>
          <ul className="space-y-2.5">
            {insightCards.map((trend) => (
              <li
                key={trend.title}
                className="surface-soft rounded-xl border border-white/10 px-3 py-2.5 light:border-slate-200"
              >
                <p className="text-sm font-semibold text-white light:text-slate-900">
                  {trend.title}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-400 light:text-slate-600">{trend.tag}</p>
                  <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-200 light:bg-violet-100 light:text-violet-700">
                    {trend.metric}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock size={16} className="text-violet-200 light:text-violet-700" />
            <h2 className="text-lg font-bold text-white light:text-slate-900">Recent Posts</h2>
          </div>
          <ul className="space-y-2.5">
            {recentPosts.map((post) => (
              <li
                key={post.id}
                className="surface-soft rounded-xl border border-white/10 px-3 py-2.5 light:border-slate-200"
              >
                <p className="text-sm font-semibold text-white light:text-slate-900">
                  {post.label}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-400 light:text-slate-600">
                  <span>{post.time}</span>
                  <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-100 light:bg-violet-100 light:text-violet-700">
                    {post.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </motion.section>
    </MobileShell>
  );
}
