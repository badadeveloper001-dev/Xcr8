"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Bell, Globe2, LogOut, Moon, Shield } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import {
  connectPlatform,
  disconnectPlatform,
  getApiErrorMessage,
  getPlatformConnections,
} from "@/lib/api";
import { useCreatorStore } from "@/lib/store";
import { updateAvatarUrl } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";
import { SocialPlatformIcon, type SocialPlatformId } from "@/components/social-platform-icon";

const platforms = [
  { id: "instagram", label: "Instagram", cls: "badge-ig" },
  { id: "tiktok", label: "TikTok", cls: "badge-tk" },
  { id: "x", label: "X / Twitter", cls: "badge-x" },
  { id: "facebook", label: "Facebook", cls: "badge-fb" },
  { id: "linkedin", label: "LinkedIn", cls: "badge-li" },
];

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hasHydrated = useCreatorStore((s) => s.hasHydrated);
  const clearSession = useCreatorStore((s) => s.clearSession);
  const userId = useCreatorStore((s) => s.userId);
  const email = useCreatorStore((s) => s.email);
  const displayName = useCreatorStore((s) => s.displayName);
  const avatarUrl = useCreatorStore((s) => s.avatarUrl);
  const setAvatarUrl = useCreatorStore((s) => s.setAvatarUrl);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [postReminderEnabled, setPostReminderEnabled] = useState(true);
  const [securityAlertsEnabled, setSecurityAlertsEnabled] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (hasHydrated && !userId) router.replace("/auth/login");
  }, [hasHydrated, router, userId]);

  useEffect(() => {
    const raw = localStorage.getItem("xcr8-settings-alerts");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        postReminders?: boolean;
        securityAlerts?: boolean;
      };
      if (typeof parsed.postReminders === "boolean") {
        setPostReminderEnabled(parsed.postReminders);
      }
      if (typeof parsed.securityAlerts === "boolean") {
        setSecurityAlertsEnabled(parsed.securityAlerts);
      }
    } catch {
      // Ignore invalid local settings payload.
    }
  }, []);

  const saveAlertSettings = (postReminders: boolean, securityAlerts: boolean) => {
    localStorage.setItem("xcr8-settings-alerts", JSON.stringify({ postReminders, securityAlerts }));
  };

  const { data: connections, isLoading } = useQuery({
    queryKey: ["platform-connections", userId],
    queryFn: () => getPlatformConnections(userId as number),
    enabled: Boolean(userId),
  });

  const connectMutation = useMutation({
    mutationFn: async (platform: string) =>
      connectPlatform(userId as number, platform, `${displayName ?? "creator"}_${platform}`),
    onSuccess: () => {
      setNotice("Platform connected.");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["platform-connections", userId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", userId] });
    },
    onError: (err) => {
      setError(getApiErrorMessage(err, "Could not connect platform."));
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (platformId: number) => disconnectPlatform(userId as number, platformId),
    onSuccess: () => {
      setNotice("Platform disconnected.");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["platform-connections", userId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", userId] });
    },
    onError: (err) => {
      setError(getApiErrorMessage(err, "Could not disconnect platform."));
    },
  });

  if (!hasHydrated || !userId) return null;

  const handleAvatarUpload = async (file: File) => {
    setUploadingAvatar(true);
    setError(null);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as { error?: string; url?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Could not upload profile image.");
      }

      const session = await updateAvatarUrl({ user_id: userId, avatar_url: payload.url });
      setAvatarUrl(session.avatar_url ?? payload.url);
      setNotice("Profile picture updated.");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not upload profile picture."));
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  };

  return (
    <MobileShell title="Settings" subtitle="Only the essentials, clearly grouped.">
      <div className="space-y-4">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
          className="xcr8-panel rounded-2xl border-2 border-cyan-300/30 p-5"
        >
          <p className="xcr8-soft-chip mb-2 inline-flex items-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
            Essentials View
          </p>
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 overflow-hidden rounded-2xl bg-violet-500/20 ring-2 ring-violet-500/30">
              <Image
                src={avatarUrl || "/avatar-placeholder.svg"}
                alt="avatar"
                width={56}
                height={56}
                className="h-full w-full object-cover"
                unoptimized
              />
            </div>
            <div>
              <p className="text-lg font-semibold text-white light:text-slate-900">
                {displayName ?? "Creator"}
              </p>
              <p className="text-sm text-slate-500">{email ?? "user@xcr8.app"}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleAvatarUpload(file);
                }
              }}
            />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/15 disabled:opacity-60 light:border-cyan-300 light:bg-cyan-50 light:text-cyan-700"
            >
              {uploadingAvatar ? "Uploading..." : "Change profile picture"}
            </button>
          </div>
        </motion.section>

        {notice ? (
          <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 light:text-emerald-700">
            {notice}
          </p>
        ) : null}

        {error ? (
          <p
            role="status"
            className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 light:text-rose-700"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "Plan", value: "Creator" },
            { label: "Status", value: "Active" },
            { label: "Security", value: "Protected" },
          ].map((chip) => (
            <div key={chip.label} className="surface-soft rounded-xl px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{chip.label}</p>
              <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                {chip.value}
              </p>
            </div>
          ))}
        </div>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.04 }}
          className="xcr8-panel rounded-2xl border-2 border-indigo-300/25 p-4"
        >
          <p className="xcr8-eyebrow mb-3">Preferences</p>

          <div className="space-y-2.5">
            <div className="surface-soft flex items-center justify-between rounded-xl px-3 py-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-700/60 text-slate-300 light:bg-slate-100 light:text-slate-600">
                  <Moon size={15} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white light:text-slate-900">
                    Appearance
                  </p>
                  <p className="text-xs text-slate-500">Dark / Light mode</p>
                </div>
              </div>
              <ThemeToggle />
            </div>

            <div className="surface-soft flex items-center justify-between rounded-xl px-3 py-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-700/60 text-slate-300 light:bg-slate-100 light:text-slate-600">
                  <Bell size={15} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white light:text-slate-900">
                    Post reminders
                  </p>
                  <p className="text-xs text-slate-500">Notify before scheduled posts</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !postReminderEnabled;
                  setPostReminderEnabled(next);
                  saveAlertSettings(next, securityAlertsEnabled);
                }}
                className={`relative inline-flex h-7 w-12 items-center rounded-full border transition ${
                  postReminderEnabled
                    ? "border-cyan-300/40 bg-cyan-500/20"
                    : "border-white/15 bg-white/5"
                }`}
                aria-label="Toggle post reminders"
                aria-pressed={postReminderEnabled}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white transition ${
                    postReminderEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="surface-soft flex items-center justify-between rounded-xl px-3 py-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-700/60 text-slate-300 light:bg-slate-100 light:text-slate-600">
                  <Shield size={15} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white light:text-slate-900">
                    Security alerts
                  </p>
                  <p className="text-xs text-slate-500">Notify on login and account activity</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !securityAlertsEnabled;
                  setSecurityAlertsEnabled(next);
                  saveAlertSettings(postReminderEnabled, next);
                }}
                className={`relative inline-flex h-7 w-12 items-center rounded-full border transition ${
                  securityAlertsEnabled
                    ? "border-cyan-300/40 bg-cyan-500/20"
                    : "border-white/15 bg-white/5"
                }`}
                aria-label="Toggle security alerts"
                aria-pressed={securityAlertsEnabled}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white transition ${
                    securityAlertsEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.08 }}
          className="xcr8-panel rounded-2xl p-4"
        >
          <p className="xcr8-eyebrow mb-2 flex items-center gap-1.5">
            <Globe2 size={12} />
            Connected Platforms
          </p>

          {isLoading ? (
            <div className="mb-2 space-y-2" aria-hidden="true">
              <div className="skeleton h-10 rounded-xl" />
              <div className="skeleton h-10 rounded-xl" />
            </div>
          ) : null}

          <div className="space-y-2">
            {platforms.map((platform) => {
              const activeRow = connections?.find(
                (item) => item.platform === platform.id && item.active,
              );

              return (
                <div
                  key={platform.id}
                  className="surface-soft flex items-center gap-3 rounded-xl px-3 py-3"
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${platform.cls}`}
                  >
                    <SocialPlatformIcon platform={platform.id as SocialPlatformId} size={14} />
                  </span>
                  <span className="flex-1 text-sm font-medium text-slate-300 light:text-slate-700">
                    {platform.label}
                  </span>

                  {activeRow ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 light:bg-emerald-100 light:text-emerald-700">
                        {activeRow.sync_status === "syncing" ? "Syncing" : "Synced"}
                      </span>
                      <button
                        type="button"
                        onClick={() => void disconnectMutation.mutate(activeRow.id)}
                        className="text-[11px] font-medium text-rose-400 hover:underline"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={connectMutation.isPending}
                      onClick={() => void connectMutation.mutate(platform.id)}
                      className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-400 hover:bg-violet-500/15 disabled:opacity-60 light:text-violet-600"
                    >
                      Connect
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Connect only channels you actively publish to this week for cleaner recommendations.
          </p>
        </motion.section>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.12 }}
        >
          <button
            type="button"
            onClick={() => {
              clearSession();
              router.push("/auth/login");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 py-3.5 text-sm font-semibold text-rose-400 transition hover:bg-rose-500/20"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </motion.div>
      </div>
    </MobileShell>
  );
}
