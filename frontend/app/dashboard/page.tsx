"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Brain,
  ChevronRight,
  Clapperboard,
  Compass,
  Images,
  Lightbulb,
  MessageSquare,
  Mic,
  Paintbrush,
  Radio,
  Settings2,
  Sparkles,
  Upload,
  User,
  Video,
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
  { label: "Create With AI", href: "/compose", icon: Wand2 },
  { label: "Generate Artwork", href: "/ai-studio?tab=art", icon: Paintbrush },
  { label: "Record Audio", href: "/ai-studio?tab=audio", icon: Mic },
  { label: "AI Voiceover", href: "/ai-studio?tab=voice", icon: MessageSquare },
  { label: "Go Live Planning", href: "/calendar?mode=live", icon: Radio },
] as const;

const connectedPlatformCards = [
  { name: "Instagram", cls: "badge-ig", growth: "+12%", sync: "Healthy" },
  { name: "TikTok", cls: "badge-tk", growth: "+18%", sync: "Healthy" },
  { name: "X / Twitter", cls: "badge-x", growth: "+5%", sync: "Stable" },
  { name: "LinkedIn", cls: "badge-li", growth: "+9%", sync: "Healthy" },
  { name: "YouTube", cls: "badge-yt", growth: "+7%", sync: "Syncing" },
  { name: "Threads", cls: "badge-th", growth: "+11%", sync: "Healthy" },
  { name: "Facebook", cls: "badge-fb", growth: "+4%", sync: "Stable" },
];

const trendRadar = [
  { title: "Afrobeats challenge clips", metric: "Rising 34%", tag: "Trending sound" },
  { title: "POV mini-story format", metric: "Rising 22%", tag: "Viral format" },
  { title: "#WeekendVibesNG", metric: "Rising 41%", tag: "Hashtag" },
];

const multiverseVariants = [
  { name: "Version A", score: 82, hook: "Story-led opening" },
  { name: "Version B", score: 76, hook: "Punchline-first hook" },
  { name: "Version C", score: 88, hook: "Emotional cold open" },
];

const assistantPrompts = [
  "Help me improve this caption",
  "Generate a luxury promo concept",
  "Why did this post underperform?",
];

export default function DashboardPage() {
  const router = useRouter();
  const userId = useCreatorStore((s) => s.userId);
  const displayName = useCreatorStore((s) => s.displayName) ?? "Creator";
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [calendarPreview, setCalendarPreview] = useState([
    { id: "t1", label: "IG Reel", time: "5:00 PM", status: "Scheduled" },
    { id: "t2", label: "TikTok Clip", time: "7:30 PM", status: "AI Recommended" },
    { id: "t3", label: "X Thread", time: "9:00 PM", status: "Draft" },
  ]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) router.replace("/auth/login");
  }, [router, userId]);

  const { data } = useQuery({
    queryKey: ["dashboard", userId],
    queryFn: () => getDashboardOverview(userId as number),
    enabled: Boolean(userId),
  });

  const dynamicGreeting = useMemo(() => {
    if ((data?.ai_suggestions ?? 0) >= 6) return "You have high-performing AI drafts ready.";
    if ((data?.platforms_connected ?? 0) >= 4)
      return "AI systems active across your connected platforms.";
    if ((data?.scheduled ?? 0) >= 3) return "Your audience is highly active today.";
    return "Your creator command center is synchronized and ready.";
  }, [data?.ai_suggestions, data?.platforms_connected, data?.scheduled]);

  if (!userId) return null;

  const moveCalendarItem = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setCalendarPreview((prev) => {
      const fromIndex = prev.findIndex((item) => item.id === fromId);
      const toIndex = prev.findIndex((item) => item.id === toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return prev;
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  return (
    <MobileShell hideHeader>
      <motion.section {...fadeUp(0)} className="mb-5">
        <div className="surface-luxe cyber-grid neon-ring rounded-[24px] p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => router.push("/settings")}
                className="relative h-12 w-12 overflow-hidden rounded-full surface-soft ring-2 ring-violet-500/35"
              >
                <Image
                  src="/avatar-placeholder.svg"
                  alt="Creator profile"
                  width={48}
                  height={48}
                  className="h-full w-full object-cover"
                />
              </button>
              <div>
                <p className="section-kicker mb-1">Creator command center</p>
                <h1 className="text-2xl font-bold tracking-tight text-white light:text-slate-900 sm:text-3xl">
                  Welcome back, {displayName}
                </h1>
                <p className="mt-1 text-sm text-slate-400 light:text-slate-500">
                  {dynamicGreeting}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/analytics")}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl surface-soft text-slate-300 transition hover:text-white light:text-slate-600 light:hover:text-slate-900"
              >
                <Bell size={17} />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-violet-500" />
              </button>
              <button
                type="button"
                onClick={() => router.push("/settings")}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl surface-soft text-slate-300 transition hover:text-white light:text-slate-600 light:hover:text-slate-900"
              >
                <Settings2 size={17} />
              </button>
              <button
                type="button"
                onClick={() => router.push("/settings")}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl surface-soft text-slate-300 transition hover:text-white light:text-slate-600 light:hover:text-slate-900"
              >
                <User size={17} />
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="surface-soft rounded-xl px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">AI Status</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-300 light:text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> AI systems active
              </p>
            </div>
            <div className="surface-soft rounded-xl px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Sync Status</p>
              <p className="mt-1 text-sm text-slate-300 light:text-slate-700">
                Realtime sync healthy
              </p>
            </div>
            <div className="surface-soft rounded-xl px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Platforms</p>
              <p className="mt-1 text-sm text-slate-300 light:text-slate-700">
                {(data?.platforms_connected ?? 0) || 3} connected and monitored
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section {...fadeUp(0.05)} className="mb-5">
        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white light:text-slate-900">Quick Create</h2>
            <span className="text-xs text-slate-500">Instant workflows</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="surface-soft group rounded-xl p-3 transition hover:opacity-95"
                >
                  <span className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-violet-500/20 text-violet-300 light:bg-violet-100 light:text-violet-700">
                    <Icon size={16} />
                  </span>
                  <p className="text-sm font-semibold text-white light:text-slate-900">
                    {action.label}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-violet-400 light:text-violet-700">
                    Open <ChevronRight size={12} />
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </motion.section>

      <motion.section {...fadeUp(0.1)} className="mb-5">
        <div className="surface-luxe cyber-grid scanline rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-500/20 text-violet-300 light:bg-violet-100 light:text-violet-700">
                <Brain size={15} />
              </span>
              AI Creator Brain
            </h2>
            <Link
              href="/analytics"
              className="text-xs font-medium text-violet-400 hover:underline light:text-violet-700"
            >
              View Full Insights
            </Link>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <article className="surface-soft rounded-xl p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Audience behavior
              </p>
              <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                Storytelling content performs 42% better.
              </p>
            </article>
            <article className="surface-soft rounded-xl p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Weak area</p>
              <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                Retention drops after 25 seconds.
              </p>
            </article>
            <article className="surface-soft rounded-xl p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Best timing</p>
              <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                Recommended posting time: 7:30 PM.
              </p>
            </article>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Link
              href="/analytics"
              className="cta-btn rounded-xl px-3 py-2 text-center text-sm font-semibold"
            >
              View Full Insights
            </Link>
            <Link
              href="/analytics?tab=strategy"
              className="surface-soft rounded-xl px-3 py-2 text-center text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Optimize Strategy
            </Link>
            <Link
              href="/compose?mode=recommendations"
              className="surface-soft rounded-xl px-3 py-2 text-center text-sm font-medium text-slate-300 light:text-slate-700"
            >
              AI Recommendations
            </Link>
          </div>
        </div>
      </motion.section>

      <motion.section {...fadeUp(0.12)} className="mb-5">
        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white light:text-slate-900">
              Connected Platforms
            </h2>
            <Link
              href="/settings"
              className="text-xs font-medium text-violet-400 hover:underline light:text-violet-700"
            >
              Manage Access
            </Link>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {connectedPlatformCards.map((platform) => (
              <article key={platform.name} className="surface-soft rounded-xl p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold text-white ${platform.cls}`}
                    >
                      {platform.name.slice(0, 2).toUpperCase()}
                    </span>
                    <p className="text-sm font-semibold text-white light:text-slate-900">
                      {platform.name}
                    </p>
                  </div>
                  <span className="text-[11px] text-emerald-400">{platform.sync}</span>
                </div>
                <p className="text-xs text-slate-500">Growth metric: {platform.growth}</p>
              </article>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Link
              href="/settings"
              className="cta-btn rounded-xl px-3 py-2 text-center text-sm font-semibold"
            >
              Connect Platform
            </Link>
            <Link
              href="/analytics"
              className="surface-soft rounded-xl px-3 py-2 text-center text-sm font-medium text-slate-300 light:text-slate-700"
            >
              View Analytics
            </Link>
            <Link
              href="/settings"
              className="surface-soft rounded-xl px-3 py-2 text-center text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Manage Access
            </Link>
          </div>
        </div>
      </motion.section>

      <motion.section {...fadeUp(0.14)} className="mb-5 grid gap-5 lg:grid-cols-2">
        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white light:text-slate-900">
              Content Calendar Preview
            </h2>
            <Link
              href="/calendar"
              className="text-xs font-medium text-violet-400 hover:underline light:text-violet-700"
            >
              Open Calendar
            </Link>
          </div>
          <div className="space-y-2.5">
            <article className="surface-soft rounded-xl p-3">
              <p className="text-xs font-semibold text-white light:text-slate-900">
                Today: 2 scheduled posts
              </p>
              <p className="mt-1 text-xs text-slate-500">
                AI suggests moving one post to 7:30 PM for better retention.
              </p>
            </article>
            <article className="surface-soft rounded-xl p-3">
              <p className="text-xs font-semibold text-white light:text-slate-900">
                Draft queue: {data?.drafts ?? 12} posts
              </p>
              <p className="mt-1 text-xs text-slate-500">
                3 drafts are flagged as high-performing candidates.
              </p>
            </article>
            <div className="space-y-2">
              {calendarPreview.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  draggable
                  onDragStart={() => setDraggingId(item.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggingId) moveCalendarItem(draggingId, item.id);
                    setDraggingId(null);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className="surface-soft flex w-full items-center justify-between rounded-xl px-3 py-2 text-left"
                >
                  <div>
                    <p className="text-xs font-semibold text-white light:text-slate-900">
                      {item.label}
                    </p>
                    <p className="text-[11px] text-slate-500">{item.status}</p>
                  </div>
                  <span className="text-xs text-violet-400 light:text-violet-700">{item.time}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Drag cards to reprioritize your posting sequence.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Link
              href="/calendar"
              className="cta-btn rounded-xl px-3 py-2 text-center text-sm font-semibold"
            >
              Open Calendar
            </Link>
            <Link
              href="/calendar?mode=reschedule"
              className="surface-soft rounded-xl px-3 py-2 text-center text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Reschedule
            </Link>
            <Link
              href="/compose"
              className="surface-soft rounded-xl px-3 py-2 text-center text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Generate More Content
            </Link>
          </div>
        </div>

        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white light:text-slate-900">
              Recent Content Performance
            </h2>
            <Link
              href="/analytics"
              className="text-xs font-medium text-violet-400 hover:underline light:text-violet-700"
            >
              Analyze
            </Link>
          </div>
          <div className="space-y-2.5">
            {(data?.recent_posts ?? []).slice(0, 3).map((post) => (
              <article key={post.post_id} className="surface-soft rounded-xl p-3">
                <p className="truncate text-sm font-semibold text-white light:text-slate-900">
                  {post.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Views +17% · Saves +9% · Sentiment positive
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-violet-300 light:text-violet-700">
                    Predicted longevity: High
                  </span>
                  <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-fuchsia-300 light:text-fuchsia-700">
                    Viral potential: Medium
                  </span>
                </div>
              </article>
            ))}
            {!data?.recent_posts?.length ? (
              <article className="surface-soft rounded-xl p-3 text-xs text-slate-500">
                Performance cards will populate as new content goes live.
              </article>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Link
              href="/analytics"
              className="cta-btn rounded-xl px-3 py-2 text-center text-sm font-semibold"
            >
              Analyze Post
            </Link>
            <Link
              href="/compose?mode=repurpose"
              className="surface-soft rounded-xl px-3 py-2 text-center text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Repurpose Content
            </Link>
            <Link
              href="/compose?mode=variations"
              className="surface-soft rounded-xl px-3 py-2 text-center text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Generate Variations
            </Link>
          </div>
        </div>
      </motion.section>

      <motion.section {...fadeUp(0.16)} className="mb-5 grid gap-5 lg:grid-cols-2">
        <div className="surface-luxe rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <Compass size={16} className="text-violet-400" /> Trend Radar
            </h2>
            <Link
              href="/analytics?tab=trends"
              className="text-xs font-medium text-violet-400 hover:underline light:text-violet-700"
            >
              Open Trends
            </Link>
          </div>
          <div className="space-y-2.5">
            {trendRadar.map((trend) => (
              <article key={trend.title} className="surface-soft rounded-xl p-3">
                <p className="text-sm font-semibold text-white light:text-slate-900">
                  {trend.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {trend.tag} · {trend.metric}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Link
              href="/compose?trend=1"
              className="cta-btn rounded-xl px-3 py-2 text-center text-sm font-semibold"
            >
              Use Trend
            </Link>
            <Link
              href="/compose"
              className="surface-soft rounded-xl px-3 py-2 text-center text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Generate Content
            </Link>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Save Trend
            </button>
          </div>
        </div>

        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <Clapperboard size={16} className="text-violet-400" /> AI Multiverse Testing
            </h2>
            <Link
              href="/analytics?tab=testing"
              className="text-xs font-medium text-violet-400 hover:underline light:text-violet-700"
            >
              Compare
            </Link>
          </div>
          <div className="space-y-2">
            {multiverseVariants.map((variant) => (
              <article key={variant.name} className="surface-soft rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white light:text-slate-900">
                    {variant.name}
                  </p>
                  <span className="text-xs text-emerald-400">{variant.score}%</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{variant.hook}</p>
              </article>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" className="cta-btn rounded-xl px-3 py-2 text-sm font-semibold">
              Apply Version A
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Generate New Variation
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Compare Results
            </button>
          </div>
        </div>
      </motion.section>

      <motion.section {...fadeUp(0.18)} className="mb-24 grid gap-5 lg:grid-cols-2">
        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <Video size={16} className="text-violet-400" /> AI Shorts Generator
            </h2>
            <Link
              href="/compose?mode=shorts"
              className="text-xs font-medium text-violet-400 hover:underline light:text-violet-700"
            >
              Open Tool
            </Link>
          </div>
          <div className="space-y-2.5">
            <article className="surface-soft rounded-xl p-3 text-xs text-slate-500">
              Long-form clips detected: 4 · Highlights auto-selected by AI.
            </article>
            <article className="surface-soft rounded-xl p-3 text-xs text-slate-500">
              Emotional moment detection enabled for hook extraction.
            </article>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Link
              href="/compose?mode=shorts"
              className="cta-btn rounded-xl px-3 py-2 text-center text-sm font-semibold"
            >
              Generate Shorts
            </Link>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Edit Clip
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Add Captions
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Export
            </button>
          </div>
        </div>

        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <Images size={16} className="text-violet-400" /> AI Visual Studio Preview
            </h2>
            <Link
              href="/ai-studio?tab=visual"
              className="text-xs font-medium text-violet-400 hover:underline light:text-violet-700"
            >
              Open Studio
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {[0, 1, 2, 3, 4, 5].map((card) => (
              <div
                key={card}
                className="surface-soft aspect-square rounded-xl bg-gradient-to-br from-violet-500/20 via-transparent to-fuchsia-500/15"
              />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Link
              href="/ai-studio?tab=art"
              className="cta-btn rounded-xl px-3 py-2 text-center text-sm font-semibold"
            >
              Generate Artwork
            </Link>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Edit Design
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Export Assets
            </button>
          </div>
        </div>
      </motion.section>

      <div className="fixed bottom-24 right-4 z-50 sm:right-6">
        {assistantOpen ? (
          <div className="surface-card neon-ring mb-3 w-[min(92vw,340px)] rounded-2xl p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-white light:text-slate-900">
                <Lightbulb size={14} className="text-violet-400" /> AI Assistant
              </p>
              <button
                type="button"
                onClick={() => setAssistantOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                Close
              </button>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              Conversational, creator-aware guidance across your workflow.
            </p>
            <div className="space-y-1.5">
              {assistantPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="surface-soft w-full rounded-xl px-2.5 py-2 text-left text-xs text-slate-300 light:text-slate-700"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setAssistantOpen((prev) => !prev)}
          className="cta-btn inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold"
        >
          <Sparkles size={16} /> AI Assistant
        </button>
      </div>
    </MobileShell>
  );
}
