"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BarChart3, Clock3, Flame, MessageSquare, TrendingUp, Zap } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { apiClient } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

async function fetchAnalytics(userId: number) {
  const { data } = await apiClient.get<{
    engagement: Array<{
      platform: string;
      engagement_rate: number;
      followers_delta: number;
      caption_effectiveness: number;
    }>;
    insights: {
      best_caption_length: number;
      best_posting_times: string[];
      trend: string;
    };
  }>(`/api/v1/analytics/overview/${userId}`);
  return data;
}

const platformColors: Record<string, string> = {
  instagram: "badge-ig",
  tiktok: "badge-tk",
  x: "badge-x",
  facebook: "badge-fb",
  linkedin: "badge-li",
  youtube_shorts: "badge-yt",
};

const platformShort: Record<string, string> = {
  instagram: "IG",
  tiktok: "TK",
  x: "X",
  facebook: "f",
  linkedin: "LI",
  youtube_shorts: "YT",
};

// Demo data for empty state fallback
const demoEngagement = [
  {
    platform: "instagram",
    engagement_rate: 0.062,
    followers_delta: 284,
    caption_effectiveness: 0.81,
  },
  {
    platform: "tiktok",
    engagement_rate: 0.118,
    followers_delta: 1240,
    caption_effectiveness: 0.74,
  },
  { platform: "x", engagement_rate: 0.031, followers_delta: 95, caption_effectiveness: 0.65 },
  {
    platform: "facebook",
    engagement_rate: 0.022,
    followers_delta: 48,
    caption_effectiveness: 0.58,
  },
];

export default function AnalyticsPage() {
  const router = useRouter();
  const userId = useCreatorStore((s) => s.userId);

  useEffect(() => {
    if (!userId) router.replace("/auth/login");
  }, [router, userId]);

  const { data } = useQuery({
    queryKey: ["analytics", userId],
    queryFn: () => fetchAnalytics(userId as number),
    enabled: Boolean(userId),
  });

  if (!userId) return null;

  const engagement = data?.engagement?.length ? data.engagement : demoEngagement;
  const usingDemoData = !data?.engagement?.length;
  const insights = data?.insights ?? {
    best_caption_length: 148,
    best_posting_times: ["8:00 PM", "12:00 PM"],
    trend: "Afrobeats + humor content is trending. Post now.",
  };

  const topStat = (engagement[0]?.engagement_rate ?? 0) * 100;

  return (
    <MobileShell title="Analytics" subtitle="Performance across all channels.">
      {!data && (
        <div className="mb-4 surface-soft rounded-xl p-3 text-xs text-slate-400 light:text-slate-600">
          Loading analytics snapshots...
        </div>
      )}
      {usingDemoData && (
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300 light:text-amber-700">
          No historical analytics yet. Showing demo insights until your first scheduled posts go
          live.
        </div>
      )}

      {/* Summary strip */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-5 grid grid-cols-2 gap-2.5"
      >
        <article className="surface-luxe cyber-grid scanline col-span-2 rounded-2xl p-4">
          <p className="section-kicker mb-2">Performance signal</p>
          <p className="text-holo text-3xl font-bold tracking-tight">
            {topStat.toFixed(1)}% peak engagement
          </p>
          <p className="mt-1 text-sm text-slate-300 light:text-slate-600">
            Your strongest platform is trending above your 30-day baseline.
          </p>
        </article>
        {[
          {
            icon: <TrendingUp size={16} />,
            iconBg: "bg-violet-500/20 text-violet-400 light:bg-violet-100 light:text-violet-600",
            val: `${topStat.toFixed(1)}%`,
            label: "Top engagement",
          },
          {
            icon: <Zap size={16} />,
            iconBg: "bg-amber-500/20 text-amber-400 light:bg-amber-100 light:text-amber-600",
            val: `${insights.best_caption_length}`,
            label: "Best length",
          },
          {
            icon: <Clock3 size={16} />,
            iconBg: "bg-blue-500/20 text-blue-400 light:bg-blue-100 light:text-blue-600",
            val: insights.best_posting_times[0] ?? "8 PM",
            label: "Peak time",
          },
        ].map((s) => (
          <article key={s.label} className="surface-card rounded-2xl p-3.5">
            <span className={`mb-2 grid h-9 w-9 place-items-center rounded-xl ${s.iconBg}`}>
              {s.icon}
            </span>
            <p className="text-xl font-bold leading-none text-white light:text-slate-900">
              {s.val}
            </p>
            <p className="mt-1 text-[11px] text-slate-400 light:text-slate-500">{s.label}</p>
          </article>
        ))}
      </motion.div>

      {/* Platform breakdown */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08 }}
        className="mb-5 surface-card rounded-2xl p-4"
      >
        <p className="section-kicker mb-2">Per platform pulse</p>
        <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-white light:text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-500/20 text-violet-400 light:bg-violet-100 light:text-violet-600">
            <BarChart3 size={15} />
          </span>
          Platform Performance
        </h3>

        <div className="space-y-3">
          {engagement.map((item) => {
            const pct = Math.round(item.engagement_rate * 100 * 10);
            const barW = Math.min(pct * 1.2, 100);
            const badgeCls = platformColors[item.platform] ?? "bg-slate-700";
            const short = platformShort[item.platform] ?? item.platform.slice(0, 2).toUpperCase();
            return (
              <article key={item.platform} className="surface-soft neon-ring rounded-2xl p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-full text-[10px] font-bold text-white ${badgeCls}`}
                    >
                      {short}
                    </span>
                    <div>
                      <p className="text-sm font-semibold capitalize text-white light:text-slate-900">
                        {item.platform.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-slate-500">
                        +{item.followers_delta} followers this week
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-white light:text-slate-900">
                      {(item.engagement_rate * 100).toFixed(1)}%
                    </p>
                    <p className="text-[11px] text-slate-500">engagement</p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10 light:bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                    style={{ width: `${barW}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Caption effectiveness</span>
                  <span className="font-medium text-slate-400 light:text-slate-500">
                    {(item.caption_effectiveness * 100).toFixed(0)}%
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </motion.section>

      {/* Insights */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.14 }}
        className="surface-card rounded-2xl p-4"
      >
        <p className="section-kicker mb-2">Actionable intelligence</p>
        <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-white light:text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-500/20 text-amber-400 light:bg-amber-100 light:text-amber-600">
            <Flame size={15} />
          </span>
          AI Insights
        </h3>

        <div className="space-y-2.5">
          <div className="surface-soft flex items-start gap-3 rounded-2xl p-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-blue-500/15 text-blue-400 light:bg-blue-100 light:text-blue-600">
              <MessageSquare size={14} />
            </span>
            <div>
              <p className="text-xs text-slate-500">Optimal caption length</p>
              <p className="text-sm font-semibold text-white light:text-slate-900">
                {insights.best_caption_length} characters
              </p>
            </div>
          </div>

          <div className="surface-soft flex items-start gap-3 rounded-2xl p-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-orange-500/15 text-orange-400 light:bg-orange-100 light:text-orange-600">
              <Clock3 size={14} />
            </span>
            <div>
              <p className="text-xs text-slate-500">Best posting times</p>
              <p className="text-sm font-semibold text-white light:text-slate-900">
                {insights.best_posting_times.join(" · ")}
              </p>
            </div>
          </div>

          <div className="surface-soft rounded-2xl p-3">
            <p className="text-xs text-slate-500 mb-1">AI trend signal</p>
            <p className="text-sm font-medium text-violet-300 light:text-violet-700">
              {insights.trend}
            </p>
          </div>
        </div>
      </motion.section>
    </MobileShell>
  );
}
