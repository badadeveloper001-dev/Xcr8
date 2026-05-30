"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BarChart3,
  Brain,
  CircleDashed,
  Download,
  Globe2,
  HeartPulse,
  Lightbulb,
  LineChart,
  Rocket,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
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
  insights: {
    best_caption_length: number;
    best_posting_times: string[];
    trend: string;
  };
};

async function fetchAnalytics(userId: number) {
  const { data } = await apiClient.get<AnalyticsOverview>(`/api/v1/analytics/overview/${userId}`);
  return data;
}

const demoEngagement: EngagementItem[] = [
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
  {
    platform: "linkedin",
    engagement_rate: 0.054,
    followers_delta: 121,
    caption_effectiveness: 0.69,
  },
  {
    platform: "youtube_shorts",
    engagement_rate: 0.089,
    followers_delta: 512,
    caption_effectiveness: 0.77,
  },
  {
    platform: "threads",
    engagement_rate: 0.043,
    followers_delta: 63,
    caption_effectiveness: 0.64,
  },
];

const platformColors: Record<string, string> = {
  instagram: "badge-ig",
  tiktok: "badge-tk",
  x: "badge-x",
  facebook: "badge-fb",
  linkedin: "badge-li",
  youtube_shorts: "badge-yt",
  threads: "badge-th",
};

const platformShort: Record<string, string> = {
  instagram: "IG",
  tiktok: "TK",
  x: "X",
  facebook: "FB",
  linkedin: "LI",
  youtube_shorts: "YT",
  threads: "TH",
};

const categoryPerformance = [
  { label: "Cinematic", score: 92, insight: "Highest retention + saves" },
  { label: "Storytelling", score: 88, insight: "Strong watch-through" },
  { label: "Educational", score: 84, insight: "Best for shares" },
  { label: "Funny", score: 81, insight: "High shares, lower retention" },
  { label: "Motivational", score: 74, insight: "Solid engagement baseline" },
  { label: "Luxury", score: 69, insight: "Niche but premium audience" },
  { label: "Informational", score: 67, insight: "Needs stronger hooks" },
  { label: "Controversial", score: 61, insight: "Spikes comments, mixed sentiment" },
];

const assistantPrompts = [
  "Why did this video underperform?",
  "What content should I post tomorrow?",
  "Why is retention dropping?",
  "What audience is growing fastest?",
];

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.38, delay },
});

export default function AnalyticsPage() {
  const router = useRouter();
  const userId = useCreatorStore((s) => s.userId);
  const displayName = useCreatorStore((s) => s.displayName) ?? "Creator";
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantAnswer, setAssistantAnswer] = useState(
    "Ask a question for strategy-grade analytics guidance.",
  );
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [exportFormat, setExportFormat] = useState<"pdf" | "presentation" | "client" | "growth">(
    "pdf",
  );
  const [viewMode, setViewMode] = useState<"home" | "audience" | "platforms" | "performance">(
    "home",
  );

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
    best_posting_times: ["7:30 PM", "12:00 PM", "8:00 PM"],
    trend: "Short hooks with strong local slang outperform baseline by 28%",
  };

  const totals = useMemo(() => {
    const reach = engagement.reduce(
      (acc, item) => acc + Math.round(item.engagement_rate * 130000),
      0,
    );
    const growth = engagement.reduce((acc, item) => acc + item.followers_delta, 0);
    const avgEngagement =
      engagement.reduce((acc, item) => acc + item.engagement_rate, 0) /
      Math.max(engagement.length, 1);
    const avgCaption =
      engagement.reduce((acc, item) => acc + item.caption_effectiveness, 0) /
      Math.max(engagement.length, 1);

    return {
      totalReach: reach,
      audienceGrowth: growth,
      engagementGrowth: avgEngagement * 100,
      watchTime: 42.8,
      retentionRate: 68 + avgCaption * 12,
      conversion: 3.2 + avgCaption * 2.1,
      consistencyScore: 76 + avgCaption * 20,
      momentum: 74 + avgEngagement * 110,
    };
  }, [engagement]);

  const exportReport = () => {
    const report = {
      creator: displayName,
      generated_at: new Date().toISOString(),
      format: exportFormat,
      summary: totals,
      insight_signal: insights,
      platform_data: engagement,
      category_intelligence: categoryPerformance,
    };

    const today = new Date().toISOString().slice(0, 10);
    const lines = [
      `XCR8 ${exportFormat.toUpperCase()} REPORT`,
      `Creator: ${report.creator}`,
      `Generated: ${report.generated_at}`,
      "",
      `Summary: ${JSON.stringify(report.summary, null, 2)}`,
      `Insights: ${JSON.stringify(report.insight_signal, null, 2)}`,
      `Platforms: ${JSON.stringify(report.platform_data, null, 2)}`,
      `Categories: ${JSON.stringify(report.category_intelligence, null, 2)}`,
    ];

    if (exportFormat === "pdf") {
      const printable = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
      if (!printable) return;
      printable.document.write(`
        <html>
          <head>
            <title>XCR8 Analytics PDF</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 32px; color: #111827; }
              h1 { color: #6d28d9; }
              pre { white-space: pre-wrap; background: #f8fafc; padding: 16px; border-radius: 12px; }
            </style>
          </head>
          <body>
            <h1>XCR8 Analytics PDF</h1>
            <p><strong>Creator:</strong> ${report.creator}</p>
            <p><strong>Generated:</strong> ${report.generated_at}</p>
            <pre>${JSON.stringify(report, null, 2)}</pre>
          </body>
        </html>
      `);
      printable.document.close();
      printable.focus();
      printable.print();
      return;
    }

    const extension = exportFormat === "presentation" ? "md" : "txt";
    const mimeType = exportFormat === "presentation" ? "text/markdown" : "text/plain";
    const blob = new Blob([lines.join("\n")], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `xcr8-${exportFormat}-report-${today}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const answerPrompt = (prompt: string) => {
    if (prompt.includes("underperform")) {
      setAssistantAnswer(
        "This post likely underperformed due to a weak first 3 seconds and late CTA placement. Next: lead with your strongest emotional hook and add subtitles immediately.",
      );
      return;
    }
    if (prompt.includes("tomorrow")) {
      setAssistantAnswer(
        "Post a cinematic storytelling piece at 7:30 PM with a concise 120-150 character caption. This aligns with your highest retention and save-rate window.",
      );
      return;
    }
    if (prompt.includes("retention")) {
      setAssistantAnswer(
        "Retention dip appears around 0:25. Compress setup and introduce payoff by 0:18. Use pacing cuts every 2-3 seconds in the middle section.",
      );
      return;
    }
    setAssistantAnswer(
      "Fastest growth is from your UK and Nigerian diaspora audience cluster. Double down on culturally relevant hooks and cross-post optimized edits on TikTok and YouTube Shorts.",
    );
  };

  const answerCustomQuestion = () => {
    const question = assistantQuestion.trim().toLowerCase();
    if (!question) return;

    if (question.includes("underperform")) {
      answerPrompt("Why did this video underperform?");
    } else if (question.includes("tomorrow") || question.includes("next")) {
      answerPrompt("What content should I post tomorrow?");
    } else if (question.includes("retention")) {
      answerPrompt("Why is retention dropping?");
    } else if (question.includes("growing") || question.includes("fastest")) {
      answerPrompt("What audience is growing fastest?");
    } else {
      setAssistantAnswer(
        `Strategic read: ${assistantQuestion}. Based on your current patterns, lead with stronger hooks, publish in your active window, and test a more emotional angle for the next post.`,
      );
    }

    setAssistantQuestion("");
  };

  return (
    <MobileShell title="Analytics Intelligence" subtitle="AI strategist for creator growth.">
      {usingDemoData ? (
        <div className="mb-4 rounded-xl border border-violet-500/20 bg-violet-500/10 p-3 text-xs text-violet-300 light:text-violet-700">
          Analytics is warming up. Demo insights are shown until your next live cycle completes.
        </div>
      ) : null}

      <motion.section {...fadeUp(0)} className="mb-5 space-y-4">
        <div className="surface-luxe scanline neon-ring rounded-[28px] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="section-kicker mb-2">Analytics Home</p>
              <h2 className="text-holo text-3xl font-bold tracking-tight sm:text-4xl">
                Creator Insights
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-400 light:text-slate-500">
                Live performance view for {displayName}. Smart recommendations are active.
              </p>
            </div>
            <div className="surface-soft rounded-2xl px-3 py-2 text-xs text-slate-400 light:text-slate-600">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-400" />
              AI insights online
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
            {[
              { label: "Total Reach", value: totals.totalReach.toLocaleString() },
              { label: "Engagement", value: `${totals.engagementGrowth.toFixed(1)}%` },
              { label: "Audience Growth", value: `+${totals.audienceGrowth}` },
              { label: "Watch Time", value: `${totals.watchTime.toFixed(1)}h` },
              { label: "Retention", value: `${totals.retentionRate.toFixed(0)}%` },
              { label: "Conversion", value: `${totals.conversion.toFixed(1)}%` },
              { label: "Momentum", value: `${totals.momentum.toFixed(0)}` },
              { label: "Consistency", value: `${totals.consistencyScore.toFixed(0)}` },
            ].map((metric) => (
              <article key={metric.label} className="surface-soft rounded-xl p-2.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  {metric.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                  {metric.value}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { id: "home", label: "Analytics Home" },
              { id: "audience", label: "Audience Intelligence" },
              { id: "platforms", label: "Platform Comparison" },
              { id: "performance", label: "Content Performance Lab" },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setViewMode(mode.id as typeof viewMode)}
                className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
                  viewMode === mode.id
                    ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40 light:bg-violet-100 light:text-violet-700"
                    : "surface-soft text-slate-400 light:text-slate-600"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
            <button type="button" className="cta-btn rounded-xl px-3 py-2 text-sm font-semibold">
              View Deep Analytics
            </button>
            <div className="surface-soft rounded-xl px-2 py-1.5">
              <div className="mb-1 grid grid-cols-2 gap-1 text-[10px]">
                {[
                  { id: "pdf", label: "PDF" },
                  { id: "presentation", label: "Presentation" },
                  { id: "client", label: "Client" },
                  { id: "growth", label: "Growth" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setExportFormat(opt.id as typeof exportFormat)}
                    className={`rounded-md px-1.5 py-1 ${
                      exportFormat === opt.id
                        ? "bg-violet-500/25 text-violet-200"
                        : "bg-white/5 text-slate-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={exportReport}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/5 px-2 py-1.5 text-xs font-medium text-slate-300 light:text-slate-700"
              >
                <Download size={13} /> Export Analytics
              </button>
            </div>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              AI Recommendations
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Compare Performance
            </button>
          </div>
        </div>
      </motion.section>

      <motion.section {...fadeUp(0.05)} className="mb-5 grid gap-4 sm:grid-cols-2">
        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-500/20 text-violet-400 light:bg-violet-100 light:text-violet-700">
                <Brain size={15} />
              </span>
              AI Creator Brain Core
            </h3>
            <span className="text-xs text-slate-500">Continuous strategic learning</span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {[
              "Your audience prefers emotionally driven storytelling.",
              "Retention increases when subtitles appear in the first 3 seconds.",
              "Darker cinematic visuals increase save-rate for your audience.",
              "Educational carousels outperform short tweets for your audience.",
            ].map((line) => (
              <article
                key={line}
                className="surface-soft rounded-xl p-3 text-xs text-slate-300 light:text-slate-700"
              >
                {line}
              </article>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" className="cta-btn rounded-xl px-3 py-2 text-sm font-semibold">
              Optimize Strategy
            </button>
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Ask AI Assistant
            </button>
          </div>
        </div>

        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <LineChart size={16} className="text-violet-400" /> Content Performance Lab
            </h3>
            <span className="text-xs text-slate-500">Hook, pacing, emotion diagnostics</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {[
              "Watch time curve: strongest in first 18s",
              "Drop-off point detected at 0:25",
              "Replay spike at product reveal",
              "Emotional peak detected at CTA transition",
            ].map((line) => (
              <article
                key={line}
                className="surface-soft rounded-xl p-3 text-xs text-slate-300 light:text-slate-700"
              >
                {line}
              </article>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" className="cta-btn rounded-xl px-3 py-2 text-sm font-semibold">
              Improve Content
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Generate Follow-Up
            </button>
          </div>
        </div>
      </motion.section>

      {viewMode === "audience" ? (
        <motion.section {...fadeUp(0.08)} className="mb-5 surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <Users size={16} className="text-violet-400" /> Audience Intelligence Screen
            </h3>
            <span className="text-xs text-slate-500">Psychology + behavior analysis</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { k: "Demographics", v: "18-34 · 63%" },
              { k: "Top Region", v: "Nigeria · UK rising" },
              { k: "Languages", v: "EN · Pidgin · Yoruba" },
              { k: "Device Split", v: "92% mobile" },
              { k: "Mood Signal", v: "Optimistic + aspirational" },
              { k: "Loyalty Score", v: "78 / 100" },
              { k: "Peak Active", v: "7:30 PM - 10:00 PM" },
              { k: "Content Preference", v: "Cinematic storytelling" },
            ].map((item) => (
              <article key={item.k} className="surface-soft rounded-xl p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{item.k}</p>
                <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                  {item.v}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" className="cta-btn rounded-xl px-3 py-2 text-sm font-semibold">
              Analyze Audience
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Build Audience Segment
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Generate Audience Strategy
            </button>
          </div>
        </motion.section>
      ) : null}

      {viewMode === "platforms" ? (
        <motion.section {...fadeUp(0.08)} className="mb-5 surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <Globe2 size={16} className="text-violet-400" /> Platform Comparison Screen
            </h3>
            <span className="text-xs text-slate-500">Cross-platform intelligence</span>
          </div>
          <div className="space-y-2.5">
            {engagement.map((item) => (
              <article key={item.platform} className="surface-soft rounded-xl p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold text-white ${platformColors[item.platform] ?? "bg-slate-700"}`}
                    >
                      {platformShort[item.platform] ?? item.platform.slice(0, 2).toUpperCase()}
                    </span>
                    <p className="text-sm font-semibold capitalize text-white light:text-slate-900">
                      {item.platform.replace(/_/g, " ")}
                    </p>
                  </div>
                  <p className="text-xs text-emerald-400">
                    {(item.engagement_rate * 100).toFixed(1)}%
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  Growth +{item.followers_delta} · Strongest type:{" "}
                  {item.caption_effectiveness > 0.72 ? "Storytelling" : "Educational"}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" className="cta-btn rounded-xl px-3 py-2 text-sm font-semibold">
              Optimize Per Platform
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Generate Platform Strategy
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Adapt Content
            </button>
          </div>
        </motion.section>
      ) : null}

      {viewMode === "performance" ? (
        <motion.section {...fadeUp(0.08)} className="mb-5 surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <LineChart size={16} className="text-violet-400" /> Content Performance Lab
            </h3>
            <span className="text-xs text-slate-500">Hook, pacing, emotion diagnostics</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              "Watch time curve: strongest in first 18s",
              "Drop-off point detected at 0:25",
              "Replay spike at product reveal",
              "Emotional peak detected at CTA transition",
            ].map((line) => (
              <article
                key={line}
                className="surface-soft rounded-xl p-3 text-xs text-slate-300 light:text-slate-700"
              >
                {line}
              </article>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" className="cta-btn rounded-xl px-3 py-2 text-sm font-semibold">
              Improve Content
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Remix Content
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Generate Follow-Up
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Create Similar Content
            </button>
          </div>
        </motion.section>
      ) : null}

      <motion.section {...fadeUp(0.12)} className="mb-5 grid gap-5 lg:grid-cols-2">
        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <CircleDashed size={16} className="text-violet-400" /> AI Multiverse Performance
              Simulator
            </h3>
            <span className="text-xs text-slate-500">Predictive scenario testing</span>
          </div>
          <div className="space-y-2">
            {[
              { label: "Hook A + warm thumbnail", score: 86, viral: 0.42 },
              { label: "Hook B + bold caption", score: 79, viral: 0.31 },
              { label: "Hook C + 7:30 PM schedule", score: 91, viral: 0.56 },
            ].map((variant) => (
              <article key={variant.label} className="surface-soft rounded-xl p-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold text-white light:text-slate-900">
                    {variant.label}
                  </p>
                  <p className="text-xs text-emerald-400">{variant.score}%</p>
                </div>
                <p className="text-[11px] text-slate-500">
                  Virality probability: {(variant.viral * 100).toFixed(0)}%
                </p>
              </article>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" className="cta-btn rounded-xl px-3 py-2 text-sm font-semibold">
              Apply Best Variation
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Run New Simulation
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Optimize Automatically
            </button>
          </div>
        </div>

        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <BarChart3 size={16} className="text-violet-400" /> Content Category Intelligence
            </h3>
            <span className="text-xs text-slate-500">Category preference mapping</span>
          </div>
          <div className="space-y-2">
            {categoryPerformance.map((category) => (
              <article key={category.label} className="surface-soft rounded-xl p-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold text-white light:text-slate-900">
                    {category.label}
                  </p>
                  <p className="text-xs text-violet-400">{category.score}</p>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10 light:bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                    style={{ width: `${category.score}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{category.insight}</p>
              </article>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" className="cta-btn rounded-xl px-3 py-2 text-sm font-semibold">
              Generate Category Strategy
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Create Similar Content
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Explore New Categories
            </button>
          </div>
        </div>
      </motion.section>

      <motion.section {...fadeUp(0.16)} className="mb-24 grid gap-5 lg:grid-cols-2">
        <div className="surface-luxe rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <Rocket size={16} className="text-violet-400" /> Creator Growth Engine
            </h3>
            <span className="text-xs text-slate-500">Forecast + consistency coaching</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <article className="surface-soft rounded-xl p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Growth Forecast
              </p>
              <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                +18% in 30 days
              </p>
            </article>
            <article className="surface-soft rounded-xl p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Burnout Detection
              </p>
              <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                Moderate risk in 2 weeks
              </p>
            </article>
            <article className="surface-soft rounded-xl p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Posting Consistency
              </p>
              <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">84 / 100</p>
            </article>
            <article className="surface-soft rounded-xl p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Momentum Velocity
              </p>
              <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                Acceleration detected
              </p>
            </article>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" className="cta-btn rounded-xl px-3 py-2 text-sm font-semibold">
              Improve Consistency
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Generate Growth Plan
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              AI Coaching
            </button>
          </div>
        </div>

        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <Target size={16} className="text-violet-400" /> AI Content Strategist
            </h3>
            <span className="text-xs text-slate-500">Weekly and campaign planning</span>
          </div>
          <div className="space-y-2.5">
            <article className="surface-soft rounded-xl p-3 text-xs text-slate-300 light:text-slate-700">
              Post more storytelling content this week across TikTok and YouTube Shorts.
            </article>
            <article className="surface-soft rounded-xl p-3 text-xs text-slate-300 light:text-slate-700">
              Your audience is highly active on Thursdays from 7 PM to 9 PM.
            </article>
            <article className="surface-soft rounded-xl p-3 text-xs text-slate-300 light:text-slate-700">
              UK audience growth is accelerating. Add one UK-oriented cultural hook this week.
            </article>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" className="cta-btn rounded-xl px-3 py-2 text-sm font-semibold">
              Apply Strategy
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Generate Weekly Plan
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Schedule Automatically
            </button>
          </div>
        </div>

        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <TrendingUp size={16} className="text-violet-400" /> Competitor & Industry Analysis
            </h3>
            <span className="text-xs text-slate-500">Privacy-safe benchmark engine</span>
          </div>
          <div className="space-y-2">
            <article className="surface-soft rounded-xl p-3 text-xs text-slate-300 light:text-slate-700">
              Niche benchmark: your save-rate sits in the top 23% of similar creator segments.
            </article>
            <article className="surface-soft rounded-xl p-3 text-xs text-slate-300 light:text-slate-700">
              Trend forecast: educational storytelling formats likely to rise over the next 2 weeks.
            </article>
            <article className="surface-soft rounded-xl p-3 text-xs text-slate-300 light:text-slate-700">
              Opportunity detection: under-served audience interest around "creator workflow
              systems".
            </article>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" className="cta-btn rounded-xl px-3 py-2 text-sm font-semibold">
              Analyze Niche
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Discover Opportunities
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Generate Competitive Strategy
            </button>
          </div>
        </div>

        <div className="surface-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white light:text-slate-900">
              <HeartPulse size={16} className="text-violet-400" /> AI Creator Health System
            </h3>
            <span className="text-xs text-slate-500">Burnout and workload protection</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <article className="surface-soft rounded-xl p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Posting Stress
              </p>
              <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                Elevated around weekends
              </p>
            </article>
            <article className="surface-soft rounded-xl p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Content Fatigue
              </p>
              <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                Early signs in current cadence
              </p>
            </article>
            <article className="surface-soft rounded-xl p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Workflow Suggestion
              </p>
              <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                Batch 2 days, automate 3 days
              </p>
            </article>
            <article className="surface-soft rounded-xl p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Recovery Window
              </p>
              <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                Recommended: Sunday reset
              </p>
            </article>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" className="cta-btn rounded-xl px-3 py-2 text-sm font-semibold">
              Optimize Workflow
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Reduce Workload
            </button>
            <button
              type="button"
              className="surface-soft rounded-xl px-3 py-2 text-sm font-medium text-slate-300 light:text-slate-700"
            >
              Automate Tasks
            </button>
          </div>
        </div>
      </motion.section>

      <div className="fixed bottom-24 right-4 z-50 sm:right-6">
        {assistantOpen ? (
          <div className="surface-card neon-ring mb-3 w-[min(92vw,340px)] rounded-2xl p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-white light:text-slate-900">
                <Lightbulb size={14} className="text-violet-400" /> Analytics AI Assistant
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
              Strategic, creator-aware answers with actionable next steps.
            </p>
            <div className="mb-2 rounded-xl border border-violet-500/20 bg-violet-500/10 px-2.5 py-2 text-xs text-violet-200 light:text-violet-700">
              {assistantAnswer}
            </div>
            <div className="mb-2 flex gap-2">
              <input
                value={assistantQuestion}
                onChange={(event) => setAssistantQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    answerCustomQuestion();
                  }
                }}
                placeholder="Ask a question..."
                className="xcr8-input flex-1 py-2 text-xs"
              />
              <button
                type="button"
                onClick={answerCustomQuestion}
                className="cta-btn rounded-xl px-3 py-2 text-xs font-semibold"
              >
                Ask
              </button>
            </div>
            <div className="space-y-1.5">
              {assistantPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => answerPrompt(prompt)}
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
          <Sparkles size={16} /> AI Analytics Assistant
        </button>
      </div>
    </MobileShell>
  );
}
