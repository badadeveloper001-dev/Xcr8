"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowRight, RefreshCw, Sparkles, Zap } from "lucide-react";

import { StudioShell } from "@/components/ai-studio/studio-shell";
import {
  getApiErrorMessage,
  getIntelligenceFeed,
  refreshIntelligence,
  submitIntelligenceFeedback,
} from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

export default function IntelligenceEnginePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const userId = useCreatorStore((state) => state.userId);
  const hasHydrated = useCreatorStore((state) => state.hasHydrated);
  const displayName = useCreatorStore((state) => state.displayName) ?? "Creator";

  const [platform, setPlatform] = useState("all");
  const [error, setError] = useState<string | null>(null);

  const feedQuery = useQuery({
    queryKey: ["intelligence-feed", userId, platform],
    queryFn: async () => {
      if (!userId) {
        throw new Error("Missing user session.");
      }
      return getIntelligenceFeed(userId, { platform, limit: 12 });
    },
    enabled: hasHydrated && Boolean(userId),
    staleTime: 30_000,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error("Missing user session.");
      }
      return refreshIntelligence({ user_id: userId, platform });
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["intelligence-feed", userId, platform] });
    },
    onError: (err) => {
      setError(getApiErrorMessage(err, "Could not refresh intelligence right now."));
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async (payload: {
      trendSignalId: number;
      action: "saved" | "dismissed" | "brainstormed" | "composed";
    }) => {
      if (!userId) {
        throw new Error("Missing user session.");
      }
      return submitIntelligenceFeedback({
        user_id: userId,
        trend_signal_id: payload.trendSignalId,
        action: payload.action,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["intelligence-feed", userId, platform] });
    },
  });

  const feed = feedQuery.data;
  const topSignal = feed?.signals[0];

  const platformOptions = useMemo(
    () => ["all", "instagram", "facebook", "youtube_shorts", "threads"],
    [],
  );

  const openAssistant = (prompt: string) => {
    router.push(`/ai-studio/assistant?prompt=${encodeURIComponent(prompt)}`);
  };

  if (!hasHydrated || !userId) {
    return null;
  }

  return (
    <StudioShell title="AI Studio" subtitle="Cr8or Intelligence Engine" activeToolId="intelligence">
      <div className="space-y-4">
        <section className="ai-stage p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white light:text-slate-900">
                {displayName}, your opportunity radar is live
              </h2>
              <p className="mt-1 text-sm text-slate-300 light:text-slate-700">
                Detect trends, research why they work, and convert them into publish-ready angles.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                className="xcr8-input min-w-[140px]"
              >
                {platformOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => refreshMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/15 disabled:opacity-60"
                disabled={refreshMutation.isPending}
              >
                <RefreshCw size={14} className={refreshMutation.isPending ? "animate-spin" : ""} />
                Refresh Signals
              </button>
            </div>
          </div>

          {topSignal ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wide text-cyan-300">Top Opportunity</p>
              <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                {topSignal.title}
              </p>
              <p className="mt-1 text-sm text-slate-300 light:text-slate-700">
                {topSignal.summary}
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300 light:text-rose-700">
              {error}
            </p>
          ) : null}
        </section>

        <section className="space-y-3">
          {feedQuery.isLoading ? (
            <div className="ai-stage p-4 text-sm text-slate-400 light:text-slate-700">
              Building your intelligence feed...
            </div>
          ) : null}

          {feed?.signals.map((signal) => {
            const recommendation = signal.recommendations[0];
            return (
              <article key={signal.id} className="ai-chat-log rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white light:text-slate-900">
                    {signal.title}
                  </p>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 light:text-slate-700">
                    score {Math.round(signal.opportunity_score * 100)}
                  </span>
                </div>

                <p className="mt-2 text-sm text-slate-300 light:text-slate-700">
                  {signal.brief.why_it_matters}
                </p>
                <p className="mt-2 text-xs text-slate-400 light:text-slate-600">
                  Risks: {signal.brief.potential_risks}
                </p>

                {recommendation ? (
                  <div className="mt-3 rounded-xl border border-indigo-300/20 bg-indigo-500/10 p-3">
                    <p className="text-xs uppercase tracking-wide text-indigo-200 light:text-indigo-700">
                      Recommended Angle
                    </p>
                    <p className="mt-1 text-sm text-white light:text-slate-900">
                      {recommendation.content_angle}
                    </p>
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 transition hover:bg-emerald-500/15"
                    onClick={() =>
                      feedbackMutation.mutate({ trendSignalId: signal.id, action: "saved" })
                    }
                  >
                    <Sparkles size={12} className="mr-1 inline" /> Save
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-cyan-300/20 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 transition hover:bg-cyan-500/15"
                    onClick={() => {
                      if (recommendation) {
                        feedbackMutation.mutate({
                          trendSignalId: signal.id,
                          action: "brainstormed",
                        });
                        router.push(
                          `/ai-studio/brainstorm?topic=${encodeURIComponent(recommendation.brainstorm_seed)}`,
                        );
                      }
                    }}
                  >
                    <Zap size={12} className="mr-1 inline" /> Brainstorm
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-violet-300/20 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 transition hover:bg-violet-500/15"
                    onClick={() => {
                      if (recommendation) {
                        feedbackMutation.mutate({ trendSignalId: signal.id, action: "composed" });
                        openAssistant(
                          `Convert this trend into a post system: ${recommendation.composer_seed}`,
                        );
                      }
                    }}
                  >
                    Compose with Cr8or AI <ArrowRight size={12} className="ml-1 inline" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
                    onClick={() =>
                      feedbackMutation.mutate({ trendSignalId: signal.id, action: "dismissed" })
                    }
                  >
                    Dismiss
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </StudioShell>
  );
}
