"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, Link2, Sparkles } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { SocialPlatformIcon, type SocialPlatformId } from "@/components/social-platform-icon";
import {
  approveDistribution,
  createDistributionDraft,
  getApiErrorMessage,
  queueSchedule,
  writeMemory,
} from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

const platformOptions = [
  { id: "instagram", label: "Instagram", cls: "badge-ig" },
  { id: "tiktok", label: "TikTok", cls: "badge-tk" },
  { id: "x", label: "X / Twitter", cls: "badge-x" },
  { id: "linkedin", label: "LinkedIn", cls: "badge-li" },
  { id: "facebook", label: "Facebook", cls: "badge-fb" },
  { id: "youtube_shorts", label: "YouTube Shorts", cls: "badge-yt" },
  { id: "threads", label: "Threads", cls: "badge-th" },
];

function getUploadUrl(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";

  const candidate =
    "url" in payload
      ? payload.url
      : "file_url" in payload
        ? payload.file_url
        : "path" in payload
          ? payload.path
          : "";

  return typeof candidate === "string" ? candidate : "";
}

export default function ComposePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hasHydrated = useCreatorStore((s) => s.hasHydrated);
  const userId = useCreatorStore((s) => s.userId);
  const setDistributionDraft = useCreatorStore((s) => s.setDistributionDraft);
  const distributionDraft = useCreatorStore((s) => s.distributionDraft);

  const [title, setTitle] = useState("New Creator Post");
  const [mediaUrl, setMediaUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram", "x"]);
  const [scheduleAt, setScheduleAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (hasHydrated && !userId) router.replace("/auth/login");
  }, [hasHydrated, router, userId]);

  const groupedVariants = useMemo(() => {
    const variants = distributionDraft?.variants ?? [];
    return variants.reduce<Record<string, typeof variants>>((acc, variant) => {
      (acc[variant.platform] ??= []).push(variant);
      return acc;
    }, {});
  }, [distributionDraft]);

  if (!hasHydrated || !userId) return null;

  const toggleItem = (id: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  };

  const createDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!caption.trim()) {
      setError("Please add a caption before generating.");
      return;
    }
    if (!mediaUrl.trim()) {
      setError("Add media before generating.");
      return;
    }
    if (!selectedPlatforms.length) {
      setError("Select at least one platform.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const draft = await createDistributionDraft({
        user_id: userId,
        title,
        media_url: mediaUrl,
        media_type: "image",
        master_caption: caption,
        primary_language: "english",
        selected_platforms: selectedPlatforms,
      });

      setDistributionDraft({
        postId: draft.post_id,
        variants: draft.variants.map((variant) => ({
          platform: variant.platform,
          language: variant.language,
          adaptedCaption: variant.adapted_caption,
          approved: variant.approved,
          hashtags: variant.hashtags,
          hook: variant.hook,
        })),
      });

      await writeMemory({
        user_id: userId,
        memory_type: "style",
        memory_key: "last_master_caption",
        memory_value: caption,
        confidence_score: 0.78,
      });

      await queryClient.invalidateQueries({ queryKey: ["dashboard", userId] });
      setNotice("Draft generated. Review below, then approve and queue.");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not generate this draft."));
    } finally {
      setLoading(false);
    }
  };

  const approveAndSchedule = async () => {
    if (!distributionDraft) return;

    setApproving(true);
    setError(null);
    setNotice(null);

    try {
      await approveDistribution({
        post_id: distributionDraft.postId,
        approvals: distributionDraft.variants.map((variant) => ({
          platform: variant.platform,
          language: variant.language,
          approved: true,
        })),
      });

      if (scheduleAt) {
        for (const platform of selectedPlatforms) {
          await queueSchedule({
            user_id: userId,
            post_id: distributionDraft.postId,
            platform,
            scheduled_for: new Date(scheduleAt).toISOString(),
            timezone: "Africa/Lagos",
          });
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard", userId] }),
        queryClient.invalidateQueries({ queryKey: ["calendar", userId] }),
      ]);
      setNotice("Approved and queued. Redirecting to calendar...");
      router.push("/calendar");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not approve and queue this post."));
    } finally {
      setApproving(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    void (async () => {
      setUploading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/v1/upload", {
          method: "POST",
          body: formData,
        });
        const data: unknown = await response.json();
        if (!response.ok) {
          const uploadError =
            getUploadUrl(data) ||
            (typeof data === "object" && data && "detail" in data && typeof data.detail === "string"
              ? data.detail
              : "Upload failed. Please try again.");
          throw new Error(uploadError);
        }
        setMediaUrl(getUploadUrl(data));
      } catch (err) {
        if (err instanceof Error && err.message.trim().length > 0) {
          setError(err.message);
        } else {
          setError("Upload failed. Please try again.");
        }
      } finally {
        setUploading(false);
      }
    })();
  };

  const steps = [
    {
      title: "Step 1",
      subtitle: "Create your base post",
      content: (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="xcr8-input"
                placeholder="Give this post a title"
              />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <Link2 size={11} /> Media
              </label>
              <input
                type="file"
                accept="image/*,video/*"
                className="xcr8-input"
                disabled={uploading}
                onChange={handleFileChange}
              />
              <p className="mt-1 text-xs text-slate-500">
                {uploading
                  ? "Uploading..."
                  : mediaUrl
                    ? "Media added."
                    : "Add one file to continue."}
              </p>
            </div>
          </div>
          <div>
            {mediaUrl ? (
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                {mediaUrl.match(/\.(mp4|mov|webm)$/i) ? (
                  <video src={mediaUrl} controls className="max-h-72 w-full" />
                ) : (
                  <img
                    src={mediaUrl}
                    alt="upload preview"
                    className="max-h-72 w-full object-cover"
                  />
                )}
              </div>
            ) : (
              <div className="surface-soft grid h-full min-h-[180px] place-items-center rounded-2xl px-4 py-5 text-sm text-slate-500">
                Preview appears here
              </div>
            )}
          </div>
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Caption
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="xcr8-input h-36 resize-none"
              placeholder="Write one caption. Xcr8 adapts it for each platform."
            />
            <p className="mt-1 text-right text-[11px] text-slate-500">{caption.length} chars</p>
          </div>
        </div>
      ),
    },
    {
      title: "Step 2",
      subtitle: "Choose channels",
      content: (
        <div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {platformOptions.map((platform) => {
              const active = selectedPlatforms.includes(platform.id);
              return (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => toggleItem(platform.id, selectedPlatforms, setSelectedPlatforms)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40 light:bg-violet-100 light:text-violet-700"
                      : "surface-soft text-slate-400 hover:text-slate-300 light:hover:text-slate-700"
                  }`}
                >
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white ${platform.cls}`}
                  >
                    <SocialPlatformIcon platform={platform.id as SocialPlatformId} size={12} />
                  </span>
                  {platform.label}
                </button>
              );
            })}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="cta-btn mt-4 w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
          >
            {loading ? "Generating adaptations..." : "Generate AI Adaptations"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <MobileShell title="Compose" subtitle="Creative flow without the noise.">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
        className="xcr8-panel rounded-2xl border-2 border-cyan-300/30 p-5"
      >
        <p className="xcr8-soft-chip mb-2 inline-flex items-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
          Studio Flow
        </p>
        <h1 className="text-xs font-semibold text-white light:text-slate-900 sm:text-sm">
          From idea to scheduled post
        </h1>
        <p className="xcr8-subtle mt-1 text-[10px] sm:text-[11px]">
          Follow the steps in order. Each section only shows what you need right now.
        </p>
      </motion.section>

      <form className="mt-4 space-y-4" onSubmit={(e) => void createDraft(e)}>
        {steps.map((step) => (
          <section key={step.title} className="xcr8-panel rounded-2xl p-4">
            <p className="xcr8-eyebrow mb-1">{step.title}</p>
            <h2 className="xcr8-title-lg mb-3 text-white light:text-slate-900">{step.subtitle}</h2>
            {step.content}
          </section>
        ))}
      </form>

      {distributionDraft ? (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
          className="xcr8-panel mt-4 rounded-2xl border-2 border-emerald-300/30 p-4"
        >
          <p className="xcr8-eyebrow mb-1">Step 3</p>
          <h2 className="xcr8-title-lg mb-3 flex items-center gap-2 text-white light:text-slate-900">
            <CheckCircle2 size={18} className="text-emerald-400" /> Review and queue
          </h2>

          <div className="space-y-3">
            {Object.entries(groupedVariants).map(([platform, variants]) => (
              <div key={platform} className="surface-soft rounded-2xl p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-violet-400 light:text-violet-600">
                  <span className="inline-flex items-center gap-1.5">
                    <SocialPlatformIcon platform={platform as SocialPlatformId} size={12} />
                    {platform}
                  </span>
                </p>
                {variants.map((variant) => (
                  <article
                    key={`${variant.platform}-${variant.language}`}
                    className="mb-2 rounded-xl border border-white/8 bg-black/20 p-3 light:border-slate-100 light:bg-white"
                  >
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {variant.language.replace(/_/g, " ")}
                    </p>
                    {variant.hook ? (
                      <p className="mb-1 text-sm font-semibold text-white light:text-slate-900">
                        {variant.hook}
                      </p>
                    ) : null}
                    <p className="text-sm text-slate-300 light:text-slate-600">
                      {variant.adaptedCaption}
                    </p>
                    {variant.hashtags.length > 0 ? (
                      <p className="mt-1 text-xs text-violet-400 light:text-violet-600">
                        {variant.hashtags.join(" ")}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Schedule (optional)
              </label>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="xcr8-input"
              />
            </div>
            <button
              type="button"
              onClick={() => void approveAndSchedule()}
              disabled={approving}
              className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {approving ? "Approving..." : "Approve and Queue"}
            </button>
          </div>
        </motion.section>
      ) : null}

      {notice ? (
        <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 light:text-emerald-700">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 light:text-rose-700"
        >
          {error}
        </p>
      ) : null}

      <div className="xcr8-panel mt-4 rounded-2xl p-4 text-sm xcr8-subtle">
        <div className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          <Sparkles size={12} />
          Smart assist
        </div>
        Xcr8 keeps your voice and language style consistent automatically across all platform
        variants.
      </div>
    </MobileShell>
  );
}
