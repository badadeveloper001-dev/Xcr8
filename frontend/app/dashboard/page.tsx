"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  CalendarClock,
  ChevronRight,
  Clock3,
  FileText,
  Flame,
  Menu,
  MoreVertical,
  Plus,
  Sparkles,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { MobileShell } from "@/components/mobile-shell";
import { getDashboardOverview, type DashboardOverviewPayload } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
});

const fallbackTrendRadar = [
  {
    title: "Funny captions perform 43% better",
    subtitle: "Best Performing Style",
    detail: "vs your average",
    icon: Sparkles,
    tone: "from-fuchsia-500/20 to-violet-500/10",
  },
  {
    title: "Your audience is most active at 8PM",
    subtitle: "Best Posting Time",
    detail: "Wednesdays and Fridays",
    icon: Clock3,
    tone: "from-amber-500/20 to-orange-500/10",
  },
  {
    title: "Afrobeats + humor content is trending",
    subtitle: "Trending Topic",
    detail: "Create content around it",
    icon: Flame,
    tone: "from-indigo-500/20 to-cyan-500/10",
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const userId = useCreatorStore((s) => s.userId);
  const displayName = useCreatorStore((s) => s.displayName) ?? "Creator";
  useEffect(() => {
    if (!userId) router.replace("/auth/login");
  }, [router, userId]);

  const { data } = useQuery<DashboardOverviewPayload, Error>({
    queryKey: ["dashboard", userId],
    queryFn: () => getDashboardOverview(userId as number),
    enabled: Boolean(userId),
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  const dynamicGreeting = useMemo(() => {
    if ((data?.ai_suggestions ?? 0) >= 6) return "Ready to publish your strongest content today?";
    if ((data?.platforms_connected ?? 0) >= 4) return "All your channels are synced and primed.";
    if ((data?.scheduled ?? 0) >= 3) return "Your schedule is healthy, now boost engagement.";
    return "Ready to create something amazing?";
  }, [data?.ai_suggestions, data?.platforms_connected, data?.scheduled]);

  const snapshotCards = useMemo(
    () => [
      {
        label: "Drafts",
        value: data?.drafts ?? 12,
        note: "Continue your drafts",
        meta: "",
        icon: FileText,
      },
      {
        label: "Scheduled",
        value: data?.scheduled ?? 8,
        note: "Next post",
        meta: "at 7:30 PM",
        icon: CalendarClock,
      },
      {
        label: "AI Suggestions",
        value: data?.ai_suggestions ?? 0,
        note: "Trending ideas for you",
        meta: "",
        icon: Zap,
      },
    ],
    [
      data?.drafts,
      data?.ai_suggestions,
      data?.scheduled,
    ],
  );

  const insightCards = useMemo(
    () =>
      data?.ai_insights?.length
        ? data.ai_insights.slice(0, 3).map((item, index) => {
            const fallback = fallbackTrendRadar[index % fallbackTrendRadar.length]!;
            return {
              title: item.title,
              subtitle: fallback.subtitle,
              detail: item.description,
              icon: fallback.icon,
              tone: fallback.tone,
            };
          })
        : fallbackTrendRadar,
    [data?.ai_insights],
  );

  const recentPosts = useMemo(() => {
    if (data?.recent_posts?.length) {
      return data.recent_posts.slice(0, 2).map((post, index) => ({
        id: String(post.post_id),
        title: post.title,
        tags: "#Afrobeats #DJMix",
        runtime: index === 0 ? "0:45" : "0:30",
        image:
          index === 0
            ? "from-fuchsia-500 via-violet-500 to-indigo-500"
            : "from-amber-400 via-pink-300 to-cyan-300",
        status: post.status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
        channels: ["IG", "FB", "X"],
      }));
    }

    return [
      {
        id: "t1",
        title: "This mix will blow your mind!",
        tags: "#Afrobeats #DJMix",
        runtime: "0:45",
        image: "from-fuchsia-500 via-violet-500 to-indigo-500",
        status: "Published",
        channels: ["IG", "FB", "X"],
      },
      {
        id: "t2",
        title: "Old school vibes never die",
        tags: "#Throwback #Classic",
        runtime: "0:30",
        image: "from-amber-400 via-rose-300 to-cyan-300",
        status: "Scheduled",
        channels: ["IG", "X"],
      },
    ];
  }, [data?.recent_posts]);

  if (!userId) return null;

  return (
    <MobileShell hideHeader>
      <motion.section {...fadeUp(0)} className="space-y-4 sm:space-y-5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-slate-200 backdrop-blur-md light:border-slate-200 light:bg-white light:text-slate-700"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-slate-200 backdrop-blur-md light:border-slate-200 light:bg-white light:text-slate-700"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-fuchsia-500" />
            </button>
            <div className="relative h-12 w-12 overflow-hidden rounded-full border-2 border-white/70 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-lg light:border-white">
              <div className="absolute inset-0 grid place-items-center text-sm font-semibold text-white">
                AB
              </div>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-black/30 bg-green-400" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[2rem] font-semibold leading-tight text-slate-100 light:text-slate-900">
              Good evening,
              <br />
              <span className="bg-gradient-to-r from-fuchsia-400 via-violet-300 to-cyan-300 bg-clip-text text-transparent light:from-violet-700 light:via-fuchsia-600 light:to-cyan-700">
                {displayName} 👋
              </span>
            </h1>
            <p className="mt-2 text-sm text-slate-300 light:text-slate-600">{dynamicGreeting}</p>
          </div>

          <div className="w-full rounded-2xl border border-white/10 bg-black/25 p-2.5 backdrop-blur-xl light:border-slate-200 light:bg-white sm:max-w-[230px]">
            <div className="flex items-center justify-between rounded-xl bg-white/5 p-2 light:bg-slate-100">
              {[
                { key: "IG", bg: "from-fuchsia-500 to-amber-400" },
                { key: "X", bg: "from-slate-950 to-slate-700" },
                { key: "FB", bg: "from-blue-500 to-cyan-400" },
              ].map((platform) => (
                <span
                  key={platform.key}
                  className={`grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br text-xs font-bold text-white ${platform.bg}`}
                >
                  {platform.key}
                </span>
              ))}
            </div>
            <p className="mt-2 text-sm text-slate-300 light:text-slate-600">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-green-400" />
              {data?.platforms_connected ?? 3} Connected
            </p>
          </div>
        </div>

        <div className="surface-luxe rounded-[26px] p-4 sm:p-5">
          <p className="section-kicker text-xs text-fuchsia-300 light:text-violet-700">
            Create New Post
          </p>
          <div className="mt-2 grid gap-4 sm:grid-cols-[1.3fr_1fr] sm:items-center">
            <div>
              <h2 className="text-3xl font-semibold leading-tight text-white light:text-slate-900">
                What do you want
                <br />
                to post today?
              </h2>
              <p className="mt-2 text-sm text-slate-300 light:text-slate-600">
                Upload your content, write a caption and let AI adapt it for every platform.
              </p>
              <Link
                href="/compose"
                className="cta-btn mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold"
              >
                <Plus size={18} />
                Create New Post
              </Link>
            </div>

            <div className="relative hidden min-h-[150px] sm:block">
              <div className="absolute right-0 top-2 h-24 w-24 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 opacity-90 shadow-xl" />
              <div className="absolute right-20 top-8 h-20 w-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 opacity-90 shadow-xl" />
              <div className="absolute right-10 top-16 h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-300 to-fuchsia-300 opacity-95 shadow-xl" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {snapshotCards.map((card) => (
            <div
              key={card.label}
              className="surface-card rounded-2xl border border-white/10 p-3.5 light:border-slate-200"
            >
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/25 to-violet-500/20 text-fuchsia-200 light:from-violet-100 light:to-fuchsia-100 light:text-violet-700">
                <card.icon size={18} />
              </div>
              <p className="text-3xl font-semibold leading-none text-white light:text-slate-900">
                {card.value}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-100 light:text-slate-900">
                {card.label}
              </p>
              <p className="mt-1 text-xs text-slate-400 light:text-slate-600">{card.note}</p>
              {card.meta ? (
                <p className="text-xs text-slate-500 light:text-slate-500">{card.meta}</p>
              ) : null}
              <div className="mt-2 flex justify-end">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-slate-300 light:bg-slate-100 light:text-slate-500">
                  <ChevronRight size={14} />
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white light:text-slate-900">AI Insights</h2>
            <Link href="/analytics" className="text-sm font-medium text-fuchsia-300 light:text-violet-700">
              View all
            </Link>
          </div>
          <ul className="space-y-2.5">
            {insightCards.map((trend) => (
              <li
                key={trend.title}
                className="surface-soft flex items-center gap-3 rounded-xl border border-white/10 px-3 py-3 light:border-slate-200"
              >
                <span
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${trend.tone} text-fuchsia-200 light:text-violet-700`}
                >
                  <trend.icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-[0.08em] text-slate-400 light:text-slate-500">
                    {trend.subtitle}
                  </p>
                  <p className="truncate text-base font-semibold text-white light:text-slate-900">
                    {trend.title}
                  </p>
                  <p className="text-sm text-slate-400 light:text-slate-600">{trend.detail}</p>
                </div>
                <ChevronRight size={16} className="text-slate-500" />
              </li>
            ))}
          </ul>
        </div>

        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white light:text-slate-900">Recent Posts</h2>
            <Link href="/compose" className="text-sm font-medium text-fuchsia-300 light:text-violet-700">
              View all
            </Link>
          </div>
          <ul className="space-y-2.5">
            {recentPosts.map((post) => (
              <li
                key={post.id}
                className="surface-soft rounded-xl border border-white/10 px-3 py-2.5 light:border-slate-200"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br ${post.image}`}
                  >
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[11px] text-white">
                      {post.runtime}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-white light:text-slate-900">
                      {post.title}
                    </p>
                    <p className="text-sm text-slate-400 light:text-slate-600">{post.tags}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {post.channels.map((channel) => (
                        <span
                          key={channel}
                          className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white/10 px-1.5 text-[10px] font-semibold text-slate-200 light:bg-slate-100 light:text-slate-600"
                        >
                          {channel}
                        </span>
                      ))}
                      <span className="ml-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-200 light:bg-emerald-100 light:text-emerald-700">
                        {post.status}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/10 light:hover:bg-slate-100"
                    aria-label="Post options"
                  >
                    <MoreVertical size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </motion.section>
    </MobileShell>
  );
}
