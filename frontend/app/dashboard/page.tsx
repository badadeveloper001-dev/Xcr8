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
  { label: "Write a Post", href: "/compose", icon: Wand2 },
  { label: "Create an Image", href: "/ai-studio?tab=art", icon: Paintbrush },
  { label: "Record Voice", href: "/ai-studio?tab=audio", icon: Mic },
  { label: "Add Narration", href: "/ai-studio?tab=voice", icon: MessageSquare },
  { label: "Plan a Live Session", href: "/calendar?mode=live", icon: Radio },
] as const;

const primaryActions = [
  {
    title: "Check Your Schedule",
    description: "See what is planned today and adjust quickly.",
    href: "/calendar",
    icon: Compass,
  },
  {
    title: "Create New Content",
    description: "Write your next post in a few simple steps.",
    href: "/compose",
    icon: Wand2,
  },
  {
    title: "See What Worked",
    description: "Review performance and get clear next actions.",
    href: "/analytics",
    icon: Brain,
  },
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
  "Improve this caption",
  "Give me 3 post ideas for this week",
  "Why did this post perform poorly?",
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
    if ((data?.ai_suggestions ?? 0) >= 6) return "You have several ready-to-publish drafts.";
    if ((data?.platforms_connected ?? 0) >= 4) return "Your connected apps are synced and ready.";
    if ((data?.scheduled ?? 0) >= 3) return "You already have a good posting plan for today.";
    return "Everything is set up. Start with your top task below.";
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
      {/* Personalized Greeting */}
      <motion.section {...fadeUp(0)} className="mb-4 sm:mb-5">
        <div className="surface-luxe rounded-[24px] p-4 sm:p-5">
          <h1 className="text-3xl font-bold">Welcome, {displayName}!</h1>
          <p className="text-sm text-slate-400">{dynamicGreeting}</p>
        </div>
      </motion.section>

      {/* Create New Post Section */}
      <motion.section {...fadeUp(0.03)} className="mb-4 sm:mb-5">
        <div className="surface-card rounded-2xl p-4">
          <h2 className="text-lg font-bold">Create New Post</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {quickActions.map((action) => (
              <Link key={action.label} href={action.href} className="rounded-xl p-3 bg-violet-100">
                <action.icon size={24} />
                <p>{action.label}</p>
              </Link>
            ))}
          </div>
        </div>
      </motion.section>

      {/* AI Insights Section */}
      <motion.section {...fadeUp(0.05)} className="mb-4 sm:mb-5">
        <div className="surface-card rounded-2xl p-4">
          <h2 className="text-lg font-bold">AI Insights</h2>
          <ul>
            {trendRadar.map((trend) => (
              <li key={trend.title} className="mb-2">
                <p className="font-semibold">{trend.title}</p>
                <p className="text-sm text-slate-400">
                  {trend.metric} - {trend.tag}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </motion.section>

      {/* Recent Posts Section */}
      <motion.section {...fadeUp(0.07)} className="mb-4 sm:mb-5">
        <div className="surface-card rounded-2xl p-4">
          <h2 className="text-lg font-bold">Recent Posts</h2>
          <ul>
            {calendarPreview.map((post) => (
              <li key={post.id} className="mb-2">
                <p className="font-semibold">{post.label}</p>
                <p className="text-sm text-slate-400">
                  {post.time} - {post.status}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </motion.section>

      {/* Ensure Modals are Mobile-Friendly */}
      <style jsx>{`
        .modal {
          width: 100%;
          height: 100%;
          padding: 1rem;
        }
      `}</style>
    </MobileShell>
  );
}
