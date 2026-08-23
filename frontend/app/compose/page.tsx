"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, ExternalLink, Link2, Send, Sparkles, XCircle } from "lucide-react";
import { DeviceMediaPicker } from "@/components/device-media-picker";
import { MobileShell } from "@/components/mobile-shell";
import { SocialPlatformIcon, type SocialPlatformId } from "@/components/social-platform-icon";
import {
  approveDistribution,
  createDistributionDraft,
  getDistributionDraft,
  getApiErrorMessage,
  publishPost,
  queueSchedule,
  writeMemory,
} from "@/lib/api";
import { uploadMediaFile, type UploadedMediaItem } from "@/lib/media-upload";
import { useCreatorStore } from "@/lib/store";

const platformOptions = [
  { id: "instagram", label: "Instagram", cls: "badge-ig" },
  { id: "facebook", label: "Facebook", cls: "badge-fb" },
  { id: "youtube_shorts", label: "YouTube Shorts", cls: "badge-yt" },
  { id: "threads", label: "Threads", cls: "badge-th" },
];

export default function ComposePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hasHydrated = useCreatorStore((s) => s.hasHydrated);
  const userId = useCreatorStore((s) => s.userId);
  const activeCreatorId = useCreatorStore((s) => s.activeCreatorId);
  const setDistributionDraft = useCreatorStore((s) => s.setDistributionDraft);
  const distributionDraft = useCreatorStore((s) => s.distributionDraft);

  const [title, setTitle] = useState("New Creator Post");
  const [resumedPostId, setResumedPostId] = useState<number | null>(null);
  const [restoringDraft, setRestoringDraft] = useState(true);
  const [localDraftReady, setLocalDraftReady] = useState(false);
  const [mediaItems, setMediaItems] = useState<UploadedMediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram", "facebook"]);
  const [scheduleAt, setScheduleAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<Record<
    string,
    { success: boolean; post_url?: string | null; error?: string | null }
  > | null>(null);

  useEffect(() => {
    if (hasHydrated && !userId) router.replace("/auth/login");
  }, [hasHydrated, router, userId]);

  const localDraftKey = `xcr8-compose-draft:${userId || "guest"}:${activeCreatorId || "main"}`;

  useEffect(() => {
    if (!hasHydrated || !userId) return;
    let cancelled = false;

    async function restoreDraft() {
      setRestoringDraft(true);
      setLocalDraftReady(false);
      const requestedId = Number(
        new URLSearchParams(window.location.search).get("draft") || 0,
      );

      if (Number.isInteger(requestedId) && requestedId > 0) {
        try {
          const saved = await getDistributionDraft(userId as number, requestedId);
          if (cancelled) return;
          setTitle(saved.title || "New Creator Post");
          setCaption(saved.master_caption || "");
          setSelectedPlatforms(saved.selected_platforms || []);
          setMediaItems(
            (saved.media_urls || [saved.media_url]).filter(Boolean).map((url, index) => ({
              url,
              mediaType:
                saved.media_types?.[index] === "video" ? "video" : "image",
              name: url.split("/").pop()?.split("?")[0] || `Saved media ${index + 1}`,
            })),
          );
          setResumedPostId(saved.post_id);
          setDistributionDraft({
            postId: saved.post_id,
            variants: saved.variants.map((variant) => ({
              platform: variant.platform,
              language: variant.language,
              adaptedCaption: variant.adapted_caption,
              approved: variant.approved,
              hashtags: variant.hashtags,
              hook: variant.hook,
            })),
          });
          setNotice("Saved draft restored. Continue editing, approve it, or publish when ready.");
        } catch (err) {
          if (!cancelled) {
            setError(getApiErrorMessage(err, "Could not restore this draft."));
          }
        }
      } else {
        try {
          const raw = window.localStorage.getItem(localDraftKey);
          if (raw) {
            const saved = JSON.parse(raw) as {
              title?: string;
              caption?: string;
              selectedPlatforms?: string[];
              scheduleAt?: string;
              mediaItems?: UploadedMediaItem[];
              postId?: number | null;
            };
            if (cancelled) return;
            setTitle(saved.title || "New Creator Post");
            setCaption(saved.caption || "");
            setSelectedPlatforms(saved.selectedPlatforms?.length ? saved.selectedPlatforms : ["instagram", "facebook"]);
            setScheduleAt(saved.scheduleAt || "");
            setMediaItems(Array.isArray(saved.mediaItems) ? saved.mediaItems : []);
            setResumedPostId(saved.postId || null);
          }
        } catch {
          window.localStorage.removeItem(localDraftKey);
        }
      }

      if (!cancelled) {
        setLocalDraftReady(true);
        setRestoringDraft(false);
      }
    }

    void restoreDraft();
    return () => {
      cancelled = true;
    };
  }, [activeCreatorId, hasHydrated, localDraftKey, setDistributionDraft, userId]);

  useEffect(() => {
    if (!localDraftReady || !userId) return;
    window.localStorage.setItem(
      localDraftKey,
      JSON.stringify({
        title,
        caption,
        selectedPlatforms,
        scheduleAt,
        mediaItems,
        postId: resumedPostId,
      }),
    );
  }, [
    caption,
    localDraftKey,
    localDraftReady,
    mediaItems,
    resumedPostId,
    scheduleAt,
    selectedPlatforms,
    title,
    userId,
  ]);

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
    if (!mediaItems.length) {
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
        ...(resumedPostId ? { post_id: resumedPostId } : {}),
        title,
        media_url: mediaItems[0]?.url ?? "",
        media_urls: mediaItems.map((item) => item.url),
        media_types: mediaItems.map((item) => item.mediaType),
        media_type: mediaItems[0]?.mediaType ?? "image",
        master_caption: caption,
        primary_language: "english",
        selected_platforms: selectedPlatforms,
      });

      setResumedPostId(draft.post_id);
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
      setNotice(
        resumedPostId
          ? "Draft updated. Review below, then approve or publish."
          : "Draft generated and saved. Review below, then approve or publish.",
      );
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
      window.localStorage.removeItem(localDraftKey);
      setDistributionDraft(null);
      setResumedPostId(null);
      setNotice("Approved and queued. Redirecting to calendar...");
      router.push("/calendar");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not approve and queue this post."));
    } finally {
      setApproving(false);
    }
  };

  const approveAndPublishNow = async () => {
    if (!distributionDraft || !userId) return;

    setPublishing(true);
    setError(null);
    setNotice(null);
    setPublishResults(null);

    try {
      // First approve all variants
      await approveDistribution({
        post_id: distributionDraft.postId,
        approvals: distributionDraft.variants.map((variant) => ({
          platform: variant.platform,
          language: variant.language,
          approved: true,
        })),
      });

      // Then publish immediately
      const response = await publishPost({
        user_id: userId,
        post_id: distributionDraft.postId,
      });

      setPublishResults(response.results);

      const successCount = Object.values(response.results).filter((r) => r.success).length;
      const total = Object.keys(response.results).length;

      if (successCount > 0) {
        window.localStorage.removeItem(localDraftKey);
        setDistributionDraft(null);
        setResumedPostId(null);
        setNotice(
          `Published to ${successCount} of ${total} platform${total !== 1 ? "s" : ""}. Check results below.`,
        );
      } else {
        setError("Publishing did not succeed on any platform. See details below.");
      }

      await queryClient.invalidateQueries({ queryKey: ["dashboard", userId] });
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not publish this post."));
    } finally {
      setPublishing(false);
    }
  };

  const handleFiles = (files: File[]) => {
    if (!files.length) return;

    void (async () => {
      setUploading(true);
      setError(null);
      try {
        const uploaded: UploadedMediaItem[] = [];
        for (const file of files) {
          uploaded.push(await uploadMediaFile(userId, file));
        }
        setMediaItems((current) => [...current, ...uploaded]);
      } catch (err) {
        setError(
          err instanceof Error && err.message.trim()
            ? err.message
            : "Upload failed. Please try again.",
        );
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
              <DeviceMediaPicker
                kind="media"
                multiple
                disabled={uploading}
                onFiles={handleFiles}
              />
              <p className="mt-1 text-xs text-slate-500">
                {uploading
                  ? "Uploading..."
                  : mediaItems.length
                    ? `${mediaItems.length} media item${mediaItems.length === 1 ? "" : "s"} added.`
                    : "Add one or more images/videos to continue."}
              </p>
            </div>
          </div>
          <div>
            {mediaItems.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {mediaItems.map((item) => (
                  <div
                    key={item.url}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                  >
                    {item.mediaType === "video" ? (
                      <video src={item.url} controls className="max-h-72 w-full" />
                    ) : (
                      <img
                        src={item.url}
                        alt={item.name}
                        className="max-h-72 w-full object-cover"
                      />
                    )}
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-400">
                      <span className="truncate">{item.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setMediaItems((current) =>
                            current.filter((entry) => entry.url !== item.url),
                          )
                        }
                        className="text-rose-300"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
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
      {restoringDraft ? (
        <div className="mb-4 rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-200 light:text-violet-700">
          Restoring your saved draft...
        </div>
      ) : null}
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

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void approveAndPublishNow()}
              disabled={publishing || approving}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
            >
              <Send size={14} />
              {publishing ? "Publishing…" : "Publish Now"}
            </button>
          </div>

          {publishResults ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Publish results
              </p>
              {Object.entries(publishResults).map(([platform, result]) => (
                <div
                  key={platform}
                  className={`flex items-start gap-3 rounded-xl p-3 text-sm ${
                    result.success
                      ? "border border-emerald-500/20 bg-emerald-500/10"
                      : "border border-rose-500/20 bg-rose-500/10"
                  }`}
                >
                  <span className="mt-0.5">
                    {result.success ? (
                      <CheckCircle2 size={15} className="text-emerald-400" />
                    ) : (
                      <XCircle size={15} className="text-rose-400" />
                    )}
                  </span>
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="font-semibold capitalize text-white light:text-slate-900">
                      {platform.replace(/_/g, " ")}
                    </span>
                    {result.success ? (
                      result.post_url ? (
                        <a
                          href={result.post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-emerald-300 underline hover:text-emerald-200"
                        >
                          View post <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="text-xs text-emerald-300">Posted successfully</span>
                      )
                    ) : (
                      <span className="text-xs text-rose-300">{result.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
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
