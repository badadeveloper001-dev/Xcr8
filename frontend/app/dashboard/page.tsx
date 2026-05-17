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
  Sparkles,
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

const trendRadar = [
  { title: "Afrobeats challenge clips", metric: "Rising 34%", tag: "Trending sound" },
  { title: "POV mini-story format", metric: "Rising 22%", tag: "Viral format" },
  { title: "#WeekendVibesNG", metric: "Rising 41%", tag: "Hashtag" },
];

export default function DashboardPage() {
  const router = useRouter();
  const userId = useCreatorStore((s) => s.userId);
  const displayName = useCreatorStore((s) => s.displayName) ?? "Creator";
  const calendarPreview = [
    { id: "t1", label: "IG Reel", time: "5:00 PM", status: "Scheduled" },
    { id: "t2", label: "TikTok Clip", time: "7:30 PM", status: "AI Recommended" },
    { id: "t3", label: "X Thread", time: "9:00 PM", status: "Draft" },
  ];

  useEffect(() => {
    if (!userId) router.replace("/auth/login");
  }, [router, userId]);

  const { data } = useQuery({
    queryKey: ["dashboard", userId],
    queryFn: () => getDashboardOverview(userId as number),
    enabled: Boolean(userId),
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

  if (!userId) return null;

  return (
    <MobileShell hideHeader>
      <motion.section {...fadeUp(0)} className="mb-4 sm:mb-5">
        <div className="surface-luxe relative overflow-hidden rounded-[24px] p-4 sm:p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(20,184,166,0.18),transparent_38%),radial-gradient(circle_at_88%_8%,rgba(249,115,22,0.18),transparent_34%)]" />
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="relative z-[1]">
              <p className="section-kicker mb-1">Today at a glance</p>
              <h1 className="text-2xl font-bold tracking-tight text-white light:text-slate-900 sm:text-3xl">
                Welcome back, {displayName}
              </h1>
              <p className="mt-1.5 max-w-[38ch] text-sm text-slate-400 light:text-slate-600">
                {dynamicGreeting}
              </p>
            </div>
            <span className="relative z-[1] inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/20 text-teal-200 light:bg-teal-100 light:text-teal-700">
              <Sparkles size={18} />
            </span>
          </div>

          <div className="relative z-[1] mb-4 flex flex-wrap gap-2">
            <Link
              href="/compose"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-teal-400"
            >
              Create post
              <ArrowUpRight size={15} />
            </Link>
            <Link
              href="/calendar"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:border-amber-300/30 hover:bg-amber-400/10 light:border-slate-200 light:bg-white light:text-slate-700 light:hover:border-amber-200 light:hover:bg-amber-50"
            >
              View schedule
              <CalendarClock size={15} />
            </Link>
          </div>

          <div className="relative z-[1] grid gap-2.5 sm:grid-cols-3">
            {snapshotCards.map((card) => (
              <div
                key={card.label}
                className="surface-soft rounded-xl border border-white/10 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] light:border-slate-200"
              >
                <p className="text-[11px] uppercase tracking-[0.13em] text-slate-500">
                  {card.label}
                </p>
                <p className="mt-1 text-xl font-semibold text-white light:text-slate-900">
                  {card.value}
                </p>
                <p className="text-xs text-slate-400 light:text-slate-600">{card.note}</p>
              </div>
            ))}
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
                className="surface-soft group flex items-center gap-3 rounded-xl border border-white/10 p-3 transition hover:-translate-y-0.5 hover:border-teal-300/40 light:border-slate-200"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/15 text-teal-200 light:bg-teal-100 light:text-teal-700">
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
                  className="text-slate-500 transition group-hover:text-teal-200 light:group-hover:text-teal-700"
                />
              </Link>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section {...fadeUp(0.06)} className="mb-4 grid gap-4 sm:mb-5 lg:grid-cols-2">
        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-amber-300 light:text-amber-700" />
            <h2 className="text-lg font-bold text-white light:text-slate-900">AI Insights</h2>
          </div>
          <ul className="space-y-2.5">
            {trendRadar.map((trend) => (
              <li
                key={trend.title}
                className="surface-soft rounded-xl border border-white/10 px-3 py-2.5 light:border-slate-200"
              >
                <p className="text-sm font-semibold text-white light:text-slate-900">
                  {trend.title}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-400 light:text-slate-600">{trend.tag}</p>
                  <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 light:bg-emerald-100 light:text-emerald-700">
                    {trend.metric}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock size={16} className="text-teal-200 light:text-teal-700" />
            <h2 className="text-lg font-bold text-white light:text-slate-900">Recent Posts</h2>
          </div>
          <ul className="space-y-2.5">
            {calendarPreview.map((post) => (
              <li
                key={post.id}
                className="surface-soft rounded-xl border border-white/10 px-3 py-2.5 light:border-slate-200"
              >
                <p className="text-sm font-semibold text-white light:text-slate-900">
                  {post.label}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-400 light:text-slate-600">
                  <span>{post.time}</span>
                  <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-medium text-teal-100 light:bg-slate-100 light:text-teal-700">
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
