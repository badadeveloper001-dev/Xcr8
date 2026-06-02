"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Bell, Globe2, LogOut, Moon, Shield, User2 } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import {
  connectPlatform,
  disconnectPlatform,
  getApiErrorMessage,
  getPlatformConnections,
} from "@/lib/api";
import { useCreatorStore } from "@/lib/store";
import { ThemeToggle } from "@/components/theme-toggle";

const platforms = [
  { id: "instagram", label: "Instagram", cls: "badge-ig", short: "IG" },
  { id: "tiktok", label: "TikTok", cls: "badge-tk", short: "TK" },
  { id: "x", label: "X / Twitter", cls: "badge-x", short: "X" },
  { id: "facebook", label: "Facebook", cls: "badge-fb", short: "FB" },
  { id: "linkedin", label: "LinkedIn", cls: "badge-li", short: "LI" },
];

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hasHydrated = useCreatorStore((s) => s.hasHydrated);
  const clearSession = useCreatorStore((s) => s.clearSession);
  const userId = useCreatorStore((s) => s.userId);
  const email = useCreatorStore((s) => s.email);
  const displayName = useCreatorStore((s) => s.displayName);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [postReminderEnabled, setPostReminderEnabled] = useState(true);
  const [securityAlertsEnabled, setSecurityAlertsEnabled] = useState(true);

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
    mutationFn: async (platform: string) => {
      return connectPlatform(userId as number, platform, `${displayName ?? "creator"}_${platform}`);
    },
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

  return (
    <MobileShell title="Settings" subtitle="Profile, accounts & preferences.">
      <div className="space-y-4">
        <div>
          <p className="xcr8-soft-chip inline-flex items-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
            Phase 6 Live
          </p>
        </div>
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

        <motion.article
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="xcr8-panel rounded-2xl border-2 border-cyan-300/35 p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-violet-500/20 ring-2 ring-violet-500/30">
                <Image
                  src="/avatar-placeholder.svg"
                  alt="avatar"
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="xcr8-eyebrow mb-2">Identity</p>
                <p className="text-lg font-bold text-white light:text-slate-900">
                  {displayName ?? "Creator"}
                </p>
                <p className="text-sm text-slate-400 light:text-slate-500">
                  {email ?? "user@xcr8.app"}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { label: "Plan", value: "Creator" },
              { label: "Status", value: "Active" },
              { label: "Security", value: "Protected" },
            ].map((chip) => (
              <div key={chip.label} className="surface-soft rounded-xl px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  {chip.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">
                  {chip.value}
                </p>
              </div>
            ))}
          </div>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="xcr8-panel rounded-2xl p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="xcr8-eyebrow">Identity details</p>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-xl surface-soft text-slate-400 hover:text-slate-200 light:hover:text-slate-700"
            >
              <User2 size={16} />
            </button>
          </div>
          <div className="surface-soft rounded-2xl p-3.5">
            <p className="text-sm font-semibold text-white light:text-slate-900">
              Creator profile connected
            </p>
            <p className="mt-1 text-xs text-slate-500 light:text-slate-600">
              Your identity and account settings are synced across the workspace.
            </p>
          </div>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="xcr8-panel rounded-2xl border-2 border-indigo-300/30 p-4"
        >
          <p className="xcr8-eyebrow mb-2">Distribution control</p>
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-white light:text-slate-900">
            <Globe2 size={15} className="text-violet-400 light:text-violet-600" />
            Connected Platforms
          </p>
          {isLoading ? (
            <div className="mb-2 space-y-2" aria-hidden="true">
              <div className="skeleton h-10 rounded-xl" />
              <div className="skeleton h-10 rounded-xl" />
            </div>
          ) : null}
          <div className="space-y-2">
            {platforms.map((p) => (
              <div key={p.id} className="surface-soft flex items-center gap-3 rounded-xl px-3 py-3">
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${p.cls}`}
                >
                  {p.short}
                </span>
                <span className="flex-1 text-sm font-medium text-slate-300 light:text-slate-700">
                  {p.label}
                </span>
                {connections?.find((c) => c.platform === p.id && c.active) ? (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 light:bg-emerald-100 light:text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      {connections?.find((c) => c.platform === p.id && c.active)?.sync_status ===
                      "syncing"
                        ? "Syncing"
                        : "Synced"}
                    </span>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-rose-400 hover:underline"
                      onClick={() => {
                        const row = connections?.find((c) => c.platform === p.id && c.active);
                        if (row) void disconnectMutation.mutate(row.id);
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={connectMutation.isPending}
                    onClick={() => void connectMutation.mutate(p.id)}
                    className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-400 hover:bg-violet-500/15 disabled:opacity-60 light:text-violet-600"
                  >
                    Connect
                  </button>
                )}
              </div>
            ))}
          </div>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.11 }}
          className="xcr8-panel flex items-center justify-between rounded-2xl p-4"
        >
          <p className="sr-only">Appearance preferences</p>
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-700/60 text-slate-300 light:bg-slate-100 light:text-slate-600">
              <Moon size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-white light:text-slate-900">Appearance</p>
              <p className="text-xs text-slate-500">Toggle dark / light mode</p>
            </div>
          </div>
          <ThemeToggle />
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.14 }}
          className="xcr8-panel rounded-2xl overflow-hidden"
        >
          <div className="border-b border-white/6 px-4 py-2 light:border-slate-100">
            <p className="xcr8-eyebrow">Alerts and safety</p>
          </div>
          {[
            {
              icon: <Bell size={15} />,
              label: "Post reminders",
              sub: "Get notified before scheduled posts",
              enabled: postReminderEnabled,
              toggle: () => {
                const next = !postReminderEnabled;
                setPostReminderEnabled(next);
                saveAlertSettings(next, securityAlertsEnabled);
              },
            },
            {
              icon: <Shield size={15} />,
              label: "Security alerts",
              sub: "Login and access notifications",
              enabled: securityAlertsEnabled,
              toggle: () => {
                const next = !securityAlertsEnabled;
                setSecurityAlertsEnabled(next);
                saveAlertSettings(postReminderEnabled, next);
              },
            },
          ].map((item, idx) => (
            <div
              key={item.label}
              className={`flex items-center gap-3 px-4 py-3.5 ${idx > 0 ? "border-t border-white/6 light:border-slate-100" : ""}`}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-700/60 text-slate-300 light:bg-slate-100 light:text-slate-600">
                {item.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white light:text-slate-900">
                  {item.label}
                </p>
                <p className="text-xs text-slate-500">{item.sub}</p>
              </div>
              <button
                type="button"
                onClick={item.toggle}
                className={`relative inline-flex h-7 w-12 items-center rounded-full border transition ${
                  item.enabled ? "border-cyan-300/40 bg-cyan-500/20" : "border-white/15 bg-white/5"
                }`}
                aria-label={`Toggle ${item.label.toLowerCase()}`}
                aria-pressed={item.enabled}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white transition ${item.enabled ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
            </div>
          ))}
        </motion.article>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.17 }}
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
