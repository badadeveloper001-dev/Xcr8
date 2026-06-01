"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";
import {
  generateAiTrendMap,
  getApiErrorMessage,
  type AiTrendMapperResponse,
} from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

const platformOptions = [
  { id: "all", label: "All platforms" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "x", label: "X / Twitter" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "facebook", label: "Facebook" },
  { id: "youtube_shorts", label: "YouTube Shorts" },
  { id: "threads", label: "Threads" },
];

const windows: Array<"7d" | "30d" | "90d"> = ["7d", "30d", "90d"];
const goals = [
  "grow audience",
  "increase engagement",
  "boost conversions",
  "improve retention",
  "find content angles",
];

export default function TrendMapperPage() {
  const router = useRouter();
  const hasHydrated = useCreatorStore((state) => state.hasHydrated);
  const userId = useCreatorStore((state) => state.userId);
  const displayName = useCreatorStore((state) => state.displayName) ?? "Creator";

  const [topic, setTopic] = useState("creator growth ideas");
  const [platform, setPlatform] = useState("all");
  const [goal, setGoal] = useState("grow audience");
  const [window, setWindow] = useState<"7d" | "30d" | "90d">("30d");
  const [trendResult, setTrendResult] = useState<AiTrendMapperResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasHydrated && !userId) router.replace("/auth/login");
  }, [hasHydrated, router, userId]);

  const mapperMutation = useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error("Missing user session. Please log in again.");
      }

      return generateAiTrendMap({
        user_id: userId,
        topic,
        goal,
        platform,
        window,
      });
    },
    onSuccess: (result) => {
      setError(null);
      setTrendResult(result);
    },
    onError: (err) => {
      setError(getApiErrorMessage(err, "Could not map trends right now. Please try again."));
    },
  });

  const openCr8orAi = (seedPrompt: string) => {
    router.push(`/ai-studio/assistant?prompt=${encodeURIComponent(seedPrompt)}`);
  };

  const signalCount = trendResult?.signals.length ?? 0;
  const sourceStats = useMemo(() => trendResult?.source_stats ?? {}, [trendResult]);

  if (!hasHydrated || !userId) return null;

  return (
    <StudioShell
      title="AI Studio"
      subtitle="Map current trend signals to concrete creator angles, hooks, and next actions."
      activeToolId="trend-mapper"
      showToolShelf={false}
    >
      <div className="space-y-4">
        <section className="surface-luxe rounded-2xl p-5">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300 light:border-cyan-300 light:bg-cyan-50 light:text-cyan-700">
            <Sparkles size={12} />
            Trend Mapper Live
          </div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-white light:text-slate-900">
            <TrendingUp size={18} className="text-cyan-300" />
            Trend intelligence for {displayName}
          </h2>
          <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
            Pick a topic, time window, and platform. Trend Mapper will return high-confidence
            trend signals with a usable hook and action plan.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="xcr8-input"
              placeholder="Topic (for example: fashion reels, fintech explainers)"
            />
            <select
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              className="xcr8-input"
            >
              {platformOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <select value={goal} onChange={(event) => setGoal(event.target.value)} className="xcr8-input">
              {goals.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={window}
              onChange={(event) => setWindow(event.target.value as "7d" | "30d" | "90d")}
              className="xcr8-input"
            >
              {windows.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => mapperMutation.mutate()}
              disabled={mapperMutation.isPending || topic.trim().length < 2}
              className="cta-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {mapperMutation.isPending ? "Mapping trends..." : "Map trends"}
              <ArrowRight size={14} />
            </button>
            <button
              type="button"
              onClick={() =>
                openCr8orAi(
                  `Use Trend Mapper context for topic \"${topic}\" and give me a 7-day action plan for ${platform}.`,
                )
              }
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/10 light:text-slate-700"
            >
              Hand off to Cr8or AI
            </button>
          </div>

          {error ? (
            <p className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300 light:text-rose-700">
              {error}
            </p>
          ) : null}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="surface-soft rounded-2xl p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Signals</p>
            <p className="mt-1 text-lg font-semibold text-white light:text-slate-900">{signalCount}</p>
          </article>
          <article className="surface-soft rounded-2xl p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Snapshots</p>
            <p className="mt-1 text-lg font-semibold text-white light:text-slate-900">
              {sourceStats.snapshots ?? 0}
            </p>
          </article>
          <article className="surface-soft rounded-2xl p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Posts scanned</p>
            <p className="mt-1 text-lg font-semibold text-white light:text-slate-900">
              {sourceStats.posts ?? 0}
            </p>
          </article>
          <article className="surface-soft rounded-2xl p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">AI Generations</p>
            <p className="mt-1 text-lg font-semibold text-white light:text-slate-900">
              {sourceStats.ai_generations ?? 0}
            </p>
          </article>
        </section>

        {trendResult ? (
          <section className="surface-card rounded-2xl p-4">
            <p className="text-sm text-slate-400 light:text-slate-600">{trendResult.summary}</p>
            <div className="mt-3 space-y-3">
              {trendResult.signals.map((signal, index) => (
                <article key={`${signal.title}-${index}`} className="surface-soft rounded-2xl p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white light:text-slate-900">{signal.title}</p>
                    <span className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-300 light:border-cyan-300 light:bg-cyan-100 light:text-cyan-700">
                      {(signal.confidence_score * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 light:text-slate-700">{signal.why_now}</p>
                  <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
                    <span className="font-semibold text-slate-200 light:text-slate-800">Angle:</span> {signal.angle}
                  </p>
                  <p className="mt-1 text-sm text-slate-400 light:text-slate-600">
                    <span className="font-semibold text-slate-200 light:text-slate-800">Hook:</span> {signal.hook}
                  </p>
                  <p className="mt-1 text-sm text-slate-400 light:text-slate-600">
                    <span className="font-semibold text-slate-200 light:text-slate-800">Action:</span> {signal.action}
                  </p>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() =>
                        openCr8orAi(
                          `Turn this trend into a full post plan: ${signal.title}. Angle: ${signal.angle}. Hook: ${signal.hook}. Action: ${signal.action}.`,
                        )
                      }
                      className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 transition hover:bg-violet-500/15 light:border-violet-300 light:bg-violet-100 light:text-violet-700"
                    >
                      Build with Cr8or AI
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className="surface-soft rounded-2xl p-5 text-sm text-slate-500 light:text-slate-600">
            Run Trend Mapper to generate live trend-to-angle recommendations.
          </section>
        )}
      </div>
    </StudioShell>
  );
}
