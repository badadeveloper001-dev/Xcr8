"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, BarChart3, Download, Sparkles } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { apiClient } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

type EngagementItem = {
  platform: string;
  engagement_rate: number;
  followers_delta: number;
  caption_effectiveness: number;
};

type AnalyticsOverview = {
  engagement: EngagementItem[];
  summary?: {
    total_reach_estimate: number;
    audience_growth: number;
    average_engagement_rate: number;
    average_caption_effectiveness: number;
    top_platform: string;
  };
  insights: {
    best_caption_length: number;
    best_posting_times: string[];
    trend: string;
  };
};

async function fetchAnalytics(userId: number, window: string) {
  const { data } = await apiClient.get<AnalyticsOverview>(`/api/v1/analytics/overview/${userId}`, {
    params: { window },
  });
  return data;
}

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.32, delay },
});

export default function AnalyticsPage() {
  const router = useRouter();
  const hasHydrated = useCreatorStore((s) => s.hasHydrated);
  const userId = useCreatorStore((s) => s.userId);
  const displayName = useCreatorStore((s) => s.displayName) ?? "Creator";

  const [analyticsWindow, setAnalyticsWindow] = useState<"7d" | "30d" | "90d">("30d");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");

  useEffect(() => {
    if (hasHydrated && !userId) router.replace("/auth/login");
  }, [hasHydrated, router, userId]);

  const { data } = useQuery({
    queryKey: ["analytics", userId, analyticsWindow],
    queryFn: () => fetchAnalytics(userId as number, analyticsWindow),
    enabled: Boolean(userId),
  });

  if (!hasHydrated || !userId) return null;

  const engagement = data?.engagement ?? [];
  const platformOptions = Array.from(new Set(engagement.map((item) => item.platform)));
  const filtered =
    selectedPlatform === "all"
      ? engagement
      : engagement.filter((item) => item.platform === selectedPlatform);

  const totalReach = data?.summary?.total_reach_estimate ?? 0;
  const audienceGrowth = data?.summary?.audience_growth ?? 0;
  const avgEngagement = (data?.summary?.average_engagement_rate ?? 0) * 100;
  const avgCaptionFit = (data?.summary?.average_caption_effectiveness ?? 0) * 100;

  const topRecommendations = [
    data?.insights?.trend ?? "No live trend signal yet.",
    data?.insights?.best_posting_times?.length
      ? `Best posting windows: ${data.insights.best_posting_times.join(" · ")}`
      : "Best posting windows: Not enough live data yet.",
    data?.insights?.best_caption_length
      ? `Ideal caption length: ${data.insights.best_caption_length} characters.`
      : "Ideal caption length: Not enough live data yet.",
  ];

  const exportSnapshot = () => {
    const lines = [
      `XCR8 ANALYTICS SNAPSHOT (${analyticsWindow})`,
      `Creator: ${displayName}`,
      `Total Reach: ${totalReach.toLocaleString()}`,
      `Audience Growth: +${audienceGrowth}`,
      `Avg Engagement: ${avgEngagement.toFixed(1)}%`,
      `Caption Fit: ${avgCaptionFit.toFixed(0)}%`,
      "",
      "Top Recommendations:",
      ...topRecommendations.map((item) => `- ${item}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `xcr8-analytics-${analyticsWindow}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <MobileShell title="Analytics" subtitle="Understand performance in under a minute.">
      <div className="space-y-4">
        {/* Header controls */}
        <motion.section
          {...fadeUp(0)}
          className="xcr8-panel rounded-2xl border-2 border-cyan-300/30 p-5"
        >
          <p className="xcr8-soft-chip mb-2 inline-flex items-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
            Clarity View
          </p>
          <h1 className="xcr8-title-xl text-white light:text-slate-900">Analytics, simplified</h1>
          <p className="xcr8-subtle mt-2 text-sm">
            Focus on what changed, what matters, and what to do next.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-[auto_auto_1fr_auto] sm:items-center">
            <div className="flex gap-2">
              {(["7d", "30d", "90d"] as const).map((windowOption) => (
                <button
                  key={windowOption}
                  type="button"
                  onClick={() => setAnalyticsWindow(windowOption)}
                  className={`rounded-xl px-3 py-2 text-xs font-medium ${
                    analyticsWindow === windowOption
                      ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/35"
                      : "surface-soft text-slate-400"
                  }`}
                >
                  {windowOption.toUpperCase()}
                </button>
              ))}
            </div>

            <select
              value={selectedPlatform}
              onChange={(event) => setSelectedPlatform(event.target.value)}
              className="xcr8-input !w-auto min-w-[170px] py-2 text-xs"
            >
              <option value="all">All platforms</option>
              {platformOptions.map((platform) => (
                <option key={platform} value={platform}>
                  {platform.replace(/_/g, " ")}
                </option>
              ))}
            </select>

            <span className="text-xs text-slate-500">
              Showing {selectedPlatform === "all" ? "all channels" : selectedPlatform}
            </span>

            <button
              type="button"
              onClick={exportSnapshot}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200"
            >
              <Download size={13} /> Export
            </button>
          </div>
        </motion.section>

        {/* Loading skeleton */}
        {!data && (
          <motion.section {...fadeUp(0.03)} className="xcr8-panel rounded-2xl p-6 text-center">
            <BarChart3 size={32} className="mx-auto mb-3 text-violet-400 opacity-50" />
            <p className="text-sm text-slate-400">Loading your analytics…</p>
          </motion.section>
        )}

        {/* No data — connect platform CTA */}
        {data && engagement.length === 0 && (
          <motion.section
            {...fadeUp(0.03)}
            className="xcr8-panel rounded-2xl border border-dashed border-white/10 p-6 text-center light:border-slate-200"
          >
            <BarChart3 size={32} className="mx-auto mb-3 text-slate-500" />
            <p className="text-sm font-semibold text-white light:text-slate-900">
              No live analytics yet
            </p>
            <p className="mt-1 text-xs text-slate-400 light:text-slate-600">
              Connect a platform in Settings, then publish a post to start seeing real data here.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/settings")}
                className="cta-btn rounded-xl px-4 py-2 text-sm font-semibold"
              >
                Connect a platform
              </button>
              <button
                type="button"
                onClick={() => router.push("/compose")}
                className="surface-soft rounded-xl px-4 py-2 text-sm font-medium text-slate-200 light:text-slate-700"
              >
                Create a post
              </button>
            </div>
          </motion.section>
        )}

        {/* Live data */}
        {data && engagement.length > 0 && (
          <>
            <motion.section
              {...fadeUp(0.05)}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              {[
                { label: "Total Reach", value: totalReach.toLocaleString() },
                { label: "Audience Growth", value: `+${audienceGrowth}` },
                { label: "Avg Engagement", value: `${avgEngagement.toFixed(1)}%` },
                { label: "Caption Fit", value: `${avgCaptionFit.toFixed(0)}%` },
              ].map((card) => (
                <article key={card.label} className="xcr8-panel rounded-2xl p-4">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    {card.label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-white light:text-slate-900">
                    {card.value}
                  </p>
                </article>
              ))}
            </motion.section>

            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <motion.section {...fadeUp(0.1)} className="xcr8-panel rounded-2xl p-4">
                <h2 className="xcr8-title-lg mb-3 flex items-center gap-2 text-white light:text-slate-900">
                  <Sparkles size={16} className="text-cyan-300" />
                  What to focus on
                </h2>
                <div className="space-y-2.5">
                  {topRecommendations.map((item) => (
                    <div
                      key={item}
                      className="surface-soft rounded-xl px-3 py-3 text-sm text-slate-200 light:text-slate-800"
                    >
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/ai-studio/assistant?prompt=${encodeURIComponent(
                          `Review my ${analyticsWindow} performance and give me a simple 3-step improvement plan.`,
                        )}`,
                      )
                    }
                    className="cta-btn rounded-xl px-3 py-2.5 text-sm font-semibold"
                  >
                    Ask Cr8or AI
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/compose")}
                    className="surface-soft rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-200 light:text-slate-800"
                  >
                    Create next post
                  </button>
                </div>
              </motion.section>

              <motion.section {...fadeUp(0.13)} className="xcr8-panel rounded-2xl p-4">
                <h2 className="xcr8-title-lg mb-3 flex items-center gap-2 text-white light:text-slate-900">
                  <BarChart3 size={16} className="text-violet-300" />
                  Platform performance
                </h2>
                <div className="space-y-2.5">
                  {filtered.map((item) => (
                    <article key={item.platform} className="surface-soft rounded-xl px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold capitalize text-white light:text-slate-900">
                          {item.platform.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-emerald-400">
                          {(item.engagement_rate * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500 light:text-slate-600">
                        <div>
                          <p>Followers</p>
                          <p className="mt-0.5 text-slate-300 light:text-slate-800">
                            +{item.followers_delta}
                          </p>
                        </div>
                        <div>
                          <p>Caption Fit</p>
                          <p className="mt-0.5 text-slate-300 light:text-slate-800">
                            {(item.caption_effectiveness * 100).toFixed(0)}%
                          </p>
                        </div>
                        <div>
                          <p>Status</p>
                          <p className="mt-0.5 text-slate-300 light:text-slate-800">Active</p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/calendar")}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-slate-200"
                >
                  Plan posting windows
                  <ArrowRight size={14} />
                </button>
              </motion.section>
            </div>
          </>
        )}
      </div>
    </MobileShell>
  );
}
