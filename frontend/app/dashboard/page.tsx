"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  FileText,
  Flame,
  Menu,
  MoreVertical,
  Plus,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { MobileShell } from "@/components/mobile-shell";
import { getDashboardOverview } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

const platforms = [
  { id: "ig", label: "IG", cls: "badge-ig" },
  { id: "x", label: "X", cls: "badge-x" },
  { id: "fb", label: "FB", cls: "badge-fb" },
  { id: "tk", label: "TK", cls: "badge-tk" },
];

const fallbackRecentPosts = [
  {
    id: "p1",
    image: "/post-1.jpg",
    title: "This mix will blow your mind!",
    tags: "#Afrobeats #DJMix",
    status: "Published" as const,
    duration: "0:45",
    platforms: ["ig", "x", "fb"],
  },
  {
    id: "p2",
    image: "/post-2.jpg",
    title: "Old school vibes never die",
    tags: "#Throwback #Classic",
    status: "Scheduled" as const,
    duration: "0:30",
    platforms: ["ig", "fb"],
  },
  {
    id: "p3",
    image: "/post-3.jpg",
    title: "Studio session recap 🎤",
    tags: "#BTS #Studio",
    status: "Scheduled" as const,
    duration: "1:02",
    platforms: ["ig", "tk"],
  },
];

const platformBadgeMap: Record<string, { cls: string; label: string }> = {
  ig: { cls: "badge-ig", label: "IG" },
  x: { cls: "badge-x", label: "X" },
  fb: { cls: "badge-fb", label: "f" },
  tk: { cls: "badge-tk", label: "TK" },
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
});

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
  });

  if (!userId) return null;

  const recentPosts = data?.recent_posts?.length
    ? data.recent_posts.map((post, idx) => ({
        id: String(post.post_id),
        image: ["/post-1.jpg", "/post-2.jpg", "/post-3.jpg"][idx % 3] ?? "/post-1.jpg",
        title: post.title,
        tags: "#Creator #XCR8",
        status: post.status === "published" ? ("Published" as const) : ("Scheduled" as const),
        duration: "0:45",
        platforms: ["ig", "x"],
      }))
    : fallbackRecentPosts;

  return (
    <MobileShell hideHeader>
      {/* ── Top bar ─────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/settings")}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl surface-soft text-slate-300 transition hover:text-white light:text-slate-600 light:hover:text-slate-900"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => router.push("/analytics")}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl surface-soft text-slate-300 transition hover:text-white light:text-slate-600 light:hover:text-slate-900"
          >
            <Bell size={18} />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-violet-500 ring-2 ring-[#080320] light:ring-white" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="relative h-11 w-11 overflow-hidden rounded-full surface-soft ring-2 ring-violet-500/40"
          >
            <Image
              src="/avatar-placeholder.svg"
              alt="avatar"
              width={44}
              height={44}
              className="h-full w-full object-cover"
            />
          </button>
        </div>
      </div>

      {/* ── Greeting ────────────────────────────────── */}
      <motion.section
        {...fadeUp(0)}
        className="mb-5 flex flex-col items-center text-center md:items-start md:text-left"
      >
        <p className="section-kicker mb-2">Creator cockpit</p>
        <h1 className="text-[38px] font-bold leading-[1.1] tracking-tight text-white light:text-slate-900">
          {getGreeting()},
        </h1>
        <h2 className="text-holo text-[38px] font-bold leading-[1.1] tracking-tight">
          {displayName}
        </h2>
        <p className="mt-2 text-[15px] text-slate-400 light:text-slate-500">
          Ready to create something amazing today?
        </p>
      </motion.section>

      {/* ── Platform connection row ──────────────────── */}
      <motion.div {...fadeUp(0.05)} className="mb-5 flex items-center gap-3">
        <div className="flex -space-x-1">
          {platforms.map((p) => (
            <span
              key={p.id}
              className={`grid h-9 w-9 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-[#080320] light:ring-white ${p.cls}`}
            >
              {p.label}
            </span>
          ))}
        </div>
        <div className="surface-soft rounded-xl px-3 py-2">
          <span className="flex items-center gap-1.5 text-sm text-slate-300 light:text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {data?.platforms_connected ?? 3} platforms connected
          </span>
        </div>
      </motion.div>

      {/* ── Hero create card ─────────────────────────── */}
      <motion.div {...fadeUp(0.08)} className="mb-5">
        <div className="surface-luxe cyber-grid scanline neon-ring relative overflow-hidden rounded-[24px] p-5 flex flex-col items-center text-center md:text-left md:items-start">
          {/* Background orb */}
          <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl light:bg-violet-300/30" />
          <div className="pointer-events-none absolute -bottom-6 left-10 h-32 w-32 rounded-full bg-fuchsia-500/15 blur-3xl light:hidden" />

          <div className="relative w-full flex flex-col items-center md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-400 light:text-violet-500">
                New Post
              </p>
              <h3 className="text-holo text-2xl font-bold leading-tight tracking-tight md:text-[1.75rem]">
                What do you want to post today?
              </h3>
              <p className="mt-1.5 text-sm text-slate-400 light:text-slate-500">
                Upload content, write one caption — AI handles the rest.
              </p>
            </div>
            <div className="shrink-0 grid h-12 w-12 place-items-center rounded-2xl bg-violet-500/20 text-violet-300 light:bg-violet-100 light:text-violet-600 mt-4 sm:mt-0">
              <Sparkles size={22} />
            </div>
          </div>

          <div className="mt-4 flex w-full flex-col gap-2 sm:flex-row sm:gap-3">
            <Link
              href="/compose"
              className="cta-btn flex-1 inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold"
            >
              <Plus size={18} /> Create New Post
            </Link>
            <Link
              href="/compose?upload=1"
              className="cta-btn flex-1 inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold bg-blue-500/80 hover:bg-blue-600/90 text-white"
            >
              <Flame size={18} /> Direct Upload
            </Link>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 w-full">
            <Link
              href="/calendar"
              className="surface-soft rounded-xl px-3 py-2 text-center text-xs font-medium text-slate-300 light:text-slate-700"
            >
              View schedule
            </Link>
            <Link
              href="/analytics"
              className="surface-soft rounded-xl px-3 py-2 text-center text-xs font-medium text-slate-300 light:text-slate-700"
            >
              Check analytics
            </Link>
          </div>
        </div>
      </motion.div>

      {/* ── Stats row ───────────────────────────────── */}
      <motion.section {...fadeUp(0.12)} className="mb-5">
        <p className="section-kicker mb-2">Today snapshot</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {[
            {
              icon: <FileText size={17} />,
              iconBg: "bg-violet-500/20 text-violet-400 light:bg-violet-100 light:text-violet-600",
              value: data?.drafts ?? 12,
              label: "Drafts",
              hint: "Continue writing",
            },
            {
              icon: <CalendarDays size={17} />,
              iconBg: "bg-blue-500/20 text-blue-400 light:bg-blue-100 light:text-blue-600",
              value: data?.scheduled ?? 8,
              label: "Scheduled",
              hint: "Next at 7 PM",
            },
            {
              icon: <Zap size={17} />,
              iconBg: "bg-amber-500/20 text-amber-400 light:bg-amber-100 light:text-amber-600",
              value: data?.ai_suggestions ?? 6,
              label: "Suggestions",
              hint: "AI ideas ready",
            },
          ].map((stat) => (
            <article key={stat.label} className="surface-card rounded-2xl p-3 sm:p-3.5">
              <span className={`mb-2 grid h-9 w-9 place-items-center rounded-xl ${stat.iconBg}`}>
                {stat.icon}
              </span>
              <p className="text-2xl font-bold leading-none text-white light:text-slate-900 sm:text-[1.65rem]">
                {stat.value}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-300 light:text-slate-700">
                {stat.label}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">{stat.hint}</p>
            </article>
          ))}
        </div>
      </motion.section>

      {/* ── AI Insights ──────────────────────────────── */}
      <motion.section {...fadeUp(0.16)} className="mb-5 surface-card rounded-2xl p-4">
        <p className="section-kicker mb-2">What AI sees</p>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-500/20 text-violet-400 light:bg-violet-100 light:text-violet-600">
              <Sparkles size={15} />
            </span>
            AI Insights
          </h3>
          <Link
            href="/analytics"
            className="flex items-center gap-0.5 text-xs font-medium text-violet-400 hover:underline light:text-violet-600"
          >
            View all <ChevronRight size={13} />
          </Link>
        </div>

        <div className="space-y-2.5">
          {[
            {
              icon: <TrendingUp size={16} />,
              iconBg:
                "bg-fuchsia-500/15 text-fuchsia-300 light:bg-fuchsia-100 light:text-fuchsia-600",
              eyebrow: "Best Performing Style",
              title: "Funny captions perform 43% better",
              sub: "vs your average across all platforms",
            },
            {
              icon: <Clock3 size={16} />,
              iconBg: "bg-orange-500/15 text-orange-300 light:bg-orange-100 light:text-orange-600",
              eyebrow: "Best Posting Time",
              title: "Your audience peaks at 8 PM",
              sub: "Wednesdays and Fridays",
            },
            {
              icon: <Flame size={16} />,
              iconBg: "bg-rose-500/15 text-rose-300 light:bg-rose-100 light:text-rose-600",
              eyebrow: "Trending Topic",
              title: "Afrobeats + humor is trending 🔥",
              sub: "Create content around it now",
            },
          ].map((insight) => (
            <article
              key={insight.eyebrow}
              className="surface-soft flex items-center gap-3 rounded-2xl p-3 transition hover:opacity-90"
            >
              <span
                className={`shrink-0 grid h-10 w-10 place-items-center rounded-xl ${insight.iconBg}`}
              >
                {insight.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {insight.eyebrow}
                </p>
                <p className="truncate text-sm font-semibold text-white light:text-slate-900">
                  {insight.title}
                </p>
                <p className="text-xs text-slate-500">{insight.sub}</p>
              </div>
              <ChevronRight size={15} className="shrink-0 text-slate-600" />
            </article>
          ))}
        </div>
      </motion.section>

      {/* ── Recent Posts ─────────────────────────────── */}
      <motion.section {...fadeUp(0.2)} className="surface-card rounded-2xl p-4">
        <p className="section-kicker mb-2">Content momentum</p>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white light:text-slate-900">Recent Posts</h3>
          <Link
            href="/compose"
            className="flex items-center gap-0.5 text-xs font-medium text-violet-400 hover:underline light:text-violet-600"
          >
            View all <ChevronRight size={13} />
          </Link>
        </div>

        <div className="space-y-2.5">
          {!data && (
            <div className="space-y-2.5" aria-hidden="true">
              <div className="skeleton h-20 rounded-2xl" />
              <div className="skeleton h-20 rounded-2xl" />
            </div>
          )}
          {recentPosts.map((post) => (
            <article
              key={post.id}
              className="surface-soft flex items-center gap-3 rounded-2xl p-2.5"
            >
              <div className="relative h-[60px] w-[90px] shrink-0 overflow-hidden rounded-xl">
                <Image src={post.image} alt={post.title} fill className="object-cover" />
                <span className="absolute bottom-1 right-1 rounded-md bg-black/70 px-1 py-0.5 text-[10px] font-medium text-white">
                  {post.duration}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white light:text-slate-900">
                  {post.title}
                </p>
                <p className="text-xs text-slate-500">{post.tags}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {post.platforms.map((pid) => {
                    const pb = platformBadgeMap[pid];
                    return pb ? (
                      <span
                        key={pid}
                        className={`grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold text-white ${pb.cls}`}
                      >
                        {pb.label}
                      </span>
                    ) : null;
                  })}
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${post.status === "Published" ? "pill-published" : "pill-scheduled"}`}
                  >
                    {post.status}
                  </span>
                </div>
              </div>
              <button type="button" className="shrink-0 text-slate-500 hover:text-slate-300">
                <MoreVertical size={17} />
              </button>
            </article>
          ))}
        </div>
      </motion.section>
    </MobileShell>
  );
}
