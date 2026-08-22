"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Bell, CreditCard, Globe2, Link2, LogOut, Moon, Shield } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import {
  connectPlatform,
  disconnectPlatform,
  getApiErrorMessage,
  getOAuthProviders,
  getPlatformConnections,
  startPlatformOAuth,
  updateProfile,
  type PlatformConnectPayload,
} from "@/lib/api";
import { useCreatorStore } from "@/lib/store";
import { updateAvatarUrl } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";
import { SocialPlatformIcon, type SocialPlatformId } from "@/components/social-platform-icon";

const platforms = [
  { id: "instagram", label: "Instagram", cls: "badge-ig" },
  { id: "facebook", label: "Facebook", cls: "badge-fb" },
  { id: "youtube_shorts", label: "YouTube Shorts", cls: "badge-yt" },
  { id: "threads", label: "Threads", cls: "badge-th" },
];

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hasHydrated = useCreatorStore((s) => s.hasHydrated);
  const clearSession = useCreatorStore((s) => s.clearSession);
  const userId = useCreatorStore((s) => s.userId);
  const email = useCreatorStore((s) => s.email);
  const displayName = useCreatorStore((s) => s.displayName);
  const fullName = useCreatorStore((s) => s.fullName);
  const username = useCreatorStore((s) => s.username);
  const phone = useCreatorStore((s) => s.phone);
  const onboardingComplete = useCreatorStore((s) => s.onboardingComplete);
  const setSession = useCreatorStore((s) => s.setSession);
  const avatarUrl = useCreatorStore((s) => s.avatarUrl);
  const setAvatarUrl = useCreatorStore((s) => s.setAvatarUrl);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [postReminderEnabled, setPostReminderEnabled] = useState(true);
  const [securityAlertsEnabled, setSecurityAlertsEnabled] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [platformDraft, setPlatformDraft] = useState<PlatformConnectPayload | null>(null);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [profileUsername, setProfileUsername] = useState(username ?? "");
  const [profilePhone, setProfilePhone] = useState(phone ?? "");

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

  useEffect(() => {
    setProfileUsername(username ?? "");
  }, [username]);

  useEffect(() => {
    setProfilePhone(phone ?? "");
  }, [phone]);

  const { data: connections, isLoading } = useQuery({
    queryKey: ["platform-connections", userId],
    queryFn: () => getPlatformConnections(userId as number),
    enabled: Boolean(userId),
  });

  const { data: oauthProviders } = useQuery({
    queryKey: ["oauth-providers"],
    queryFn: () => getOAuthProviders(),
    staleTime: 5 * 60 * 1000,
  });

  const activeConnections = (connections ?? []).filter((item) => item.active);
  const oauthConnections = activeConnections.filter((item) => item.connection_method === "oauth");
  const filledProfileFields = [profileUsername, profilePhone].filter(
    (value) => value.trim().length > 0,
  ).length;
  const profileCompleteness = Math.round((filledProfileFields / 2) * 100);

  const connectMutation = useMutation({
    mutationFn: async (payload: PlatformConnectPayload) =>
      connectPlatform(userId as number, payload),
    onSuccess: (connection) => {
      setNotice(`${connection.platform} connected as ${connection.handle}.`);
      setError(null);
      setPlatformDraft(null);
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

  const activeDraftPlatform = platformDraft?.platform ?? null;

  const handleOAuthConnect = async (platform: string) => {
    setNotice(null);
    setError(null);
    setOauthLoading(platform);
    try {
      const response = await startPlatformOAuth(userId, platform);
      // Redirect user to platform OAuth page
      window.location.href = response.auth_url;
    } catch (err) {
      setOauthLoading(null);
      // Fall back to manual form on error (e.g. not configured)
      setError(
        getApiErrorMessage(
          err,
          `Could not start ${platform} OAuth. Use the manual handle form below.`,
        ),
      );
      openPlatformDraft(platform);
    }
  };

  const openPlatformDraft = (platform: string) => {
    setNotice(null);
    setError(null);
    setPlatformDraft({
      platform,
      handle: "",
      profile_url: "",
    });
  };

  const submitPlatformDraft = async () => {
    if (!platformDraft) return;

    const handle = platformDraft.handle.trim();
    const profileUrl = platformDraft.profile_url?.trim() || "";
    if (!handle) {
      setError("Add your account handle, page name, or channel name.");
      return;
    }

    await connectMutation.mutateAsync({
      platform: platformDraft.platform,
      handle,
      profile_url: profileUrl || null,
    });
  };

  const handleProfileSave = async () => {
    const nextUsername = profileUsername.trim();
    const nextPhone = profilePhone.trim();

    if (nextUsername.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }

    setSavingProfile(true);
    setError(null);
    setNotice(null);
    try {
      const session = await updateProfile({
        user_id: userId,
        username: nextUsername || null,
        phone: nextPhone || null,
      });

      setSession({
        userId: session.user_id,
        email: session.email,
        displayName: session.display_name,
        fullName: session.full_name,
        username: session.username,
        phone: session.phone,
        avatarUrl: session.avatar_url ?? avatarUrl,
        onboardingComplete,
      });

      setNotice("Profile updated.");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not update profile."));
    } finally {
      setSavingProfile(false);
    }
  };

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
    <MobileShell title="Settings" subtitle="Profile, connections, and safety controls.">
      <div className="space-y-4">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
          className="xcr8-panel rounded-2xl border-2 border-cyan-300/30 p-5"
        >
          <p className="xcr8-soft-chip mb-2 inline-flex items-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
            Creator Snapshot
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
              <p className="text-xs text-slate-500">
                Keep this profile synced with your creator identity and publishing connections.
              </p>
              <p className="text-sm text-slate-500">{email ?? "user@xcr8.app"}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {
                label: "Platforms",
                value: activeConnections.length,
                hint: activeConnections.length ? "Connected" : "None linked",
              },
              {
                label: "OAuth",
                value: oauthConnections.length,
                hint: oauthConnections.length ? "Can publish" : "Manual only",
              },
              {
                label: "Identity",
                value: `${profileCompleteness}%`,
                hint: `${filledProfileFields}/2 fields filled`,
              },
              {
                label: "Status",
                value: onboardingComplete ? "Ready" : "Pending",
                hint: onboardingComplete ? "Setup complete" : "Finish onboarding",
              },
            ].map((chip) => (
              <div key={chip.label} className="surface-soft rounded-xl px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  {chip.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                  {chip.value}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">{chip.hint}</p>
              </div>
            ))}
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
          <p className="xcr8-eyebrow mb-3">Profile</p>
          <p className="mb-3 text-xs text-slate-500">
            Username and phone are editable here. Display name stays read-only.
          </p>
          <div className="space-y-2.5">
            <input
              value={profileUsername}
              onChange={(event) => setProfileUsername(event.target.value)}
              className="xcr8-input"
              placeholder="Username"
            />
            <input
              value={profilePhone}
              onChange={(event) => setProfilePhone(event.target.value)}
              className="xcr8-input"
              placeholder="Phone number"
              inputMode="tel"
              autoComplete="tel"
            />
            <button
              type="button"
              disabled={savingProfile}
              onClick={() => void handleProfileSave()}
              className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/15 disabled:opacity-60 light:border-cyan-300 light:bg-cyan-50 light:text-cyan-700"
            >
              {savingProfile ? "Saving..." : "Save profile"}
            </button>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.03 }}
          className="xcr8-panel rounded-2xl border-2 border-violet-300/25 p-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-300 light:bg-violet-100 light:text-violet-700">
                <CreditCard size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-white light:text-slate-900">
                  Plans, credits & billing
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  View your current plan, monthly limits, credit balance, and future upgrades.
                </p>
              </div>
            </div>
            <Link
              href="/settings/billing"
              className="shrink-0 rounded-full border border-violet-400/30 bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/25 light:text-violet-700"
            >
              View plans
            </Link>
          </div>
        </motion.section>

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

          <p className="mb-3 text-xs text-slate-500">
            Platforms with <span className="font-medium text-violet-400">Connect via OAuth</span>{" "}
            enabled can publish posts directly from Xcr8. Others can be linked by handle for AI
            recommendations only.
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
              const isOAuthConfigured = oauthProviders?.configured.includes(platform.id) ?? false;
              const isOAuthMethod = activeRow?.connection_method === "oauth";

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
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-slate-300 light:text-slate-700">
                      {platform.label}
                    </span>
                    {activeRow ? (
                      <span className="truncate text-xs text-slate-500">
                        {activeRow.handle}
                        {isOAuthMethod ? (
                          <span className="ml-1.5 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
                            OAuth ✓ can post
                          </span>
                        ) : (
                          <span className="ml-1.5 rounded-full bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                            Manual
                          </span>
                        )}
                      </span>
                    ) : null}
                  </div>

                  {activeRow ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 light:bg-emerald-100 light:text-emerald-700">
                        Connected
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
                    <div className="flex items-center gap-1.5">
                      {isOAuthConfigured ? (
                        <button
                          type="button"
                          disabled={oauthLoading === platform.id || connectMutation.isPending}
                          onClick={() => void handleOAuthConnect(platform.id)}
                          className="rounded-full border border-violet-500/30 bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/25 disabled:opacity-60 light:text-violet-600"
                        >
                          {oauthLoading === platform.id ? "Redirecting…" : "Connect via OAuth"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={connectMutation.isPending}
                        onClick={() => openPlatformDraft(platform.id)}
                        title="Link handle manually (no direct publishing)"
                        className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/10 disabled:opacity-60 light:border-slate-200 light:bg-white/80 light:text-slate-500"
                      >
                        <Link2 size={11} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {platformDraft ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4 light:border-slate-200 light:bg-white/80">
              <p className="text-sm font-semibold text-white light:text-slate-900">
                Link {platforms.find((item) => item.id === activeDraftPlatform)?.label} manually
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Manual links let Xcr8 use your handle for AI recommendations. To enable direct
                publishing, use <span className="text-violet-400">Connect via OAuth</span> instead.
              </p>

              <div className="mt-3 space-y-3">
                <input
                  value={platformDraft.handle}
                  onChange={(event) =>
                    setPlatformDraft((current) =>
                      current ? { ...current, handle: event.target.value } : current,
                    )
                  }
                  className="xcr8-input"
                  placeholder="@yourhandle or Channel Name"
                />
                <input
                  value={platformDraft.profile_url ?? ""}
                  onChange={(event) =>
                    setPlatformDraft((current) =>
                      current ? { ...current, profile_url: event.target.value } : current,
                    )
                  }
                  className="xcr8-input"
                  placeholder="https://... (optional profile URL)"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void submitPlatformDraft()}
                    disabled={connectMutation.isPending}
                    className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/15 disabled:opacity-60 light:border-cyan-300 light:bg-cyan-50 light:text-cyan-700"
                  >
                    {connectMutation.isPending ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlatformDraft(null)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}

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
