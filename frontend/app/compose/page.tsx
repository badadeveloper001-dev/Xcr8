"use client";

import { FormEvent, useEffect, useMemo, useState, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronRight, LayoutGrid, Link2, Pencil, Sparkles } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import {
  getApiErrorMessage,
  approveDistribution,
  createDistributionDraft,
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

const steps = [
  { n: 1, icon: <Pencil size={14} />, label: "Write caption" },
  { n: 2, icon: <LayoutGrid size={14} />, label: "Pick platforms" },
  { n: 3, icon: <Sparkles size={14} />, label: "AI generates" },
  { n: 4, icon: <CheckCircle2 size={14} />, label: "Approve & schedule" },
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
    return variants.reduce<Record<string, typeof variants>>((acc, v) => {
      (acc[v.platform] ??= []).push(v);
      return acc;
    }, {});
  }, [distributionDraft]);

  if (!hasHydrated || !userId) return null;

  const toggleItem = (id: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const createDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!caption.trim()) {
      setError("Please add a master caption before generating adaptations.");
      return;
    }
    if (!mediaUrl.trim()) {
      setError("Add a media URL from upload before generating.");
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
        variants: draft.variants.map((v) => ({
          platform: v.platform,
          language: v.language,
          adaptedCaption: v.adapted_caption,
          approved: v.approved,
          hashtags: v.hashtags,
          hook: v.hook,
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
        "Draft saved and adaptations generated. Review variants below and approve when ready.",
      );
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not generate adaptations. Please try again."));
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
        approvals: distributionDraft.variants.map((v) => ({
          platform: v.platform,
          language: v.language,
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
      setNotice("Approved and queued successfully. Redirecting to calendar...");
      router.push("/calendar");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not approve and queue this post."));
    } finally {
      setApproving(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    void (async () => {
      setUploading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/v1/upload", {
          method: "POST",
          body: formData,
        });
        const data: unknown = await res.json();
        if (!res.ok) {
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

  return (
    <MobileShell title="Create Post" subtitle="One caption, everywhere.">
      {notice ? (
        <p className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 light:text-emerald-700">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          role="status"
          className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 light:text-rose-700"
        >
          {error}
        </p>
      ) : null}

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38 }}
        className="mb-5"
      >
        <div className="surface-luxe rounded-[28px] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="section-kicker mb-2">Composer Studio</p>
              <h1 className="text-3xl font-semibold leading-tight text-white light:text-slate-900">
                Create once. Publish everywhere.
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300 light:text-slate-600">
                Write one master caption, generate channel versions, then approve and schedule.
              </p>
            </div>
            <div className="grid min-w-[180px] grid-cols-2 gap-2.5">
              {[
                { label: "Platforms", value: `${selectedPlatforms.length}` },
                { label: "Memory", value: "On" },
                { label: "AI Variants", value: distributionDraft ? "Ready" : "Pending" },
                { label: "Queue", value: scheduleAt ? "Set" : "Open" },
              ].map((item) => (
                <div key={item.label} className="surface-soft rounded-xl p-3 text-left">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 light:text-slate-600">
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* Workflow steps indicator */}
      <div className="surface-soft neon-ring sticky top-2 z-20 mb-5 flex flex-wrap items-center gap-2 rounded-2xl px-2.5 py-2.5 backdrop-blur-xl">
        {steps.map((step, idx) => (
          <div key={step.n} className="flex items-center">
            <div
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition ${
                step.n <= (distributionDraft ? 4 : 1)
                  ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/30 light:bg-violet-100 light:text-violet-700"
                  : "text-slate-500 light:text-slate-600"
              }`}
            >
              {step.icon}
              <span>{step.label}</span>
            </div>
            {idx < steps.length - 1 && (
              <ChevronRight size={13} className="mx-0.5 text-slate-700 light:text-slate-300" />
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        {/* ── LEFT: Form ────────────────────────────── */}
        <form className="space-y-4" onSubmit={(e) => void createDraft(e)}>
          {/* Title */}
          <div className="surface-card rounded-2xl p-5">
            <p className="section-kicker mb-2">Post foundation</p>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Post title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="xcr8-input"
              placeholder="Give this post a title"
            />
          </div>

          {/* Media URL */}
          <div className="surface-card rounded-2xl p-5">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <Link2 size={11} /> Media Upload
            </label>
            <input
              type="file"
              accept="image/*,video/*"
              className="xcr8-input"
              disabled={uploading}
              onChange={handleFileChange}
            />
            {mediaUrl && (
              <div className="mt-2">
                {mediaUrl.match(/\.(mp4|mov|webm)$/i) ? (
                  <video src={mediaUrl} controls className="max-h-48 rounded-xl" />
                ) : (
                  <img src={mediaUrl} alt="upload preview" className="max-h-48 rounded-xl" />
                )}
              </div>
            )}
            <p className="mt-1.5 text-xs text-slate-500">
              {uploading
                ? "Uploading..."
                : mediaUrl
                  ? "Media uploaded!"
                  : "Upload an image or video from your device."}
            </p>
          </div>

          {/* Master caption */}
          <div className="surface-card rounded-2xl p-5">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Master caption
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="xcr8-input h-32 resize-none"
              placeholder="Write one caption. Xcr8 adapts it for each platform."
            />
            <p className="mt-1.5 text-right text-[11px] text-slate-600">{caption.length} chars</p>
          </div>

          {/* Platform selector */}
          <div className="surface-card rounded-2xl p-5">
            <p className="section-kicker mb-2">Distribution map</p>
            <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <LayoutGrid size={11} className="mr-1 inline" /> Platforms
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {platformOptions.map((p) => {
                const active = selectedPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleItem(p.id, selectedPlatforms, setSelectedPlatforms)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40 light:bg-violet-100 light:text-violet-700 light:ring-violet-300"
                        : "surface-soft text-slate-400 hover:text-slate-300 light:hover:text-slate-600"
                    }`}
                  >
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white ${p.cls}`}
                    >
                      {p.label.slice(0, 2).toUpperCase()}
                    </span>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="cta-btn w-full rounded-2xl py-3.5 text-[15px] font-semibold disabled:opacity-60"
          >
            {loading ? "Generating AI adaptations…" : "✦ Generate AI Adaptations"}
          </button>
        </form>

        {/* ── RIGHT: Workflow guide / variants ──────── */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="surface-luxe scanline rounded-2xl p-4">
            <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-white light:text-slate-900">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-500/20 text-violet-400 light:bg-violet-100 light:text-violet-600">
                <Sparkles size={15} />
              </span>
              How it works
            </h3>
            <ol className="space-y-2">
              {steps.map((step) => (
                <li
                  key={step.n}
                  className="surface-soft flex items-center gap-3 rounded-xl px-3 py-2.5"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-400 light:bg-violet-100 light:text-violet-600">
                    {step.n}
                  </span>
                  <span className="text-sm text-slate-300 light:text-slate-600">{step.label}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="surface-card rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Creator memory active
            </p>
            <p className="mt-2 text-sm text-slate-300 light:text-slate-600">
              Xcr8 learns your tone, emoji usage, and slang to keep every adaptation sounding like{" "}
              <em>you</em>.
            </p>
            <div className="mt-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-300 light:text-indigo-700">
              Language is auto-detected from your master caption. No manual language selection
              needed.
            </div>
            <div className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-xs text-violet-300 light:text-violet-700">
              Pro tip: Start with a strong hook in your master caption. AI keeps that energy per
              platform.
            </div>
          </div>
        </aside>
      </div>

      {/* ── Approval section ──────────────────────── */}
      {distributionDraft && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="surface-card mt-5 rounded-2xl p-5"
        >
          <p className="section-kicker mb-2">Approval desk</p>
          <h2 className="text-holo mb-4 flex items-center gap-2 text-lg font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-500/20 text-emerald-400 light:bg-emerald-100 light:text-emerald-600">
              <CheckCircle2 size={16} />
            </span>
            AI Adaptations — Ready to review
          </h2>

          <div className="space-y-3">
            {Object.entries(groupedVariants).map(([platform, variants]) => (
              <div key={platform} className="surface-soft rounded-2xl p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-violet-400 light:text-violet-600">
                  {platform}
                </p>
                {variants.map((v) => (
                  <article
                    key={`${v.platform}-${v.language}`}
                    className="mb-2.5 rounded-xl border border-white/8 bg-black/20 p-3 light:border-slate-100 light:bg-white"
                  >
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {v.language.replace(/_/g, " ")}
                    </p>
                    {v.hook && (
                      <p className="mb-1.5 text-sm font-semibold text-white light:text-slate-900">
                        🪝 {v.hook}
                      </p>
                    )}
                    <p className="text-sm text-slate-300 light:text-slate-600">
                      {v.adaptedCaption}
                    </p>
                    {v.hashtags.length > 0 && (
                      <p className="mt-1.5 text-xs text-violet-400 light:text-violet-600">
                        {v.hashtags.join(" ")}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Schedule for (optional)
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
              className="w-full rounded-2xl bg-emerald-500 py-3.5 text-[15px] font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {approving ? "Approving and queueing..." : "✓ Approve and Queue Publishing"}
            </button>
          </div>
        </motion.section>
      )}
    </MobileShell>
  );
}
