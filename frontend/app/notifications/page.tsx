"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Bell, CheckCheck, RefreshCw, Sparkles } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import {
  getApiErrorMessage,
  getIntelligenceFeed,
  markIntelligenceNotificationRead,
  refreshIntelligence,
  type IntelligenceFeedResponse,
  type IntelligenceNotification,
} from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

const severityStyles: Record<string, string> = {
  critical: "border-rose-500/40 bg-rose-500/15 text-rose-100 light:border-rose-300 light:bg-rose-50 light:text-rose-800",
  high: "border-rose-500/25 bg-rose-500/10 text-rose-200 light:border-rose-200 light:bg-rose-50 light:text-rose-700",
  medium:
    "border-amber-500/25 bg-amber-500/10 text-amber-200 light:border-amber-200 light:bg-amber-50 light:text-amber-700",
  low: "border-cyan-500/25 bg-cyan-500/10 text-cyan-200 light:border-cyan-200 light:bg-cyan-50 light:text-cyan-700",
  info: "border-violet-500/25 bg-violet-500/10 text-violet-200 light:border-violet-200 light:bg-violet-50 light:text-violet-700",
};

function formatCreatedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Recently";
  }
  return parsed.toLocaleString();
}

export default function NotificationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const hasHydrated = useCreatorStore((state) => state.hasHydrated);
  const userId = useCreatorStore((state) => state.userId);
  const selectedNotificationId = Number(searchParams.get("notification") || 0) || null;
  const markReadInFlight = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (hasHydrated && !userId) {
      router.replace("/auth/login");
    }
  }, [hasHydrated, router, userId]);

  const { data, error, isFetching, refetch } = useQuery<IntelligenceFeedResponse, Error>({
    queryKey: ["notifications", userId],
    queryFn: () => getIntelligenceFeed(userId as number),
    enabled: Boolean(userId),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: number) =>
      markIntelligenceNotificationRead(notificationId, userId as number),
    onSuccess: (updated) => {
      queryClient.setQueryData<IntelligenceFeedResponse>(["notifications", userId], (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          notifications: current.notifications.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        };
      });
    },
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const latestSeverity = notifications[0]?.severity ?? "info";
  const selectedNotification = selectedNotificationId
    ? (notifications.find((item) => item.id === selectedNotificationId) ?? null)
    : null;

  useEffect(() => {
    if (
      !selectedNotificationId ||
      !selectedNotification ||
      selectedNotification.is_read ||
      markReadInFlight.current.has(selectedNotificationId)
    ) {
      return;
    }

    markReadInFlight.current.add(selectedNotificationId);
    void markReadMutation
      .mutateAsync(selectedNotificationId)
      .finally(() => markReadInFlight.current.delete(selectedNotificationId));
  }, [markReadMutation, selectedNotification, selectedNotificationId]);

  const handleRefresh = async () => {
    if (!userId) {
      return;
    }

    try {
      await refreshIntelligence({ user_id: userId });
      await refetch();
    } catch {
      // Surface the failure through the page-level error message.
    }
  };

  if (!hasHydrated || !userId) {
    return null;
  }

  const openNotification = (notificationId: number) => {
    router.push(`/notifications?notification=${notificationId}`);
  };

  return (
    <MobileShell title="Notifications" subtitle="Trend updates and Pulse support messages appear here.">
      <div className="space-y-4">
        <section className="xcr8-panel rounded-2xl border-2 border-cyan-300/30 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="xcr8-soft-chip mb-2 inline-flex items-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
                Inbox
              </p>
              <h1 className="xcr8-title-xl text-white light:text-slate-900">Notifications</h1>
            </div>

            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/15 light:border-cyan-300 light:bg-cyan-50 light:text-cyan-700"
              disabled={isFetching}
            >
              <RefreshCw size={15} className={isFetching ? "animate-spin" : undefined} />
              Refresh inbox
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {[
              { label: "Total", value: notifications.length, hint: "Recent inbox items" },
              { label: "Unread", value: unreadCount, hint: "Needs attention" },
              {
                label: "Latest",
                value: latestSeverity.toUpperCase(),
                hint: "Most recent severity",
              },
            ].map((item) => (
              <div key={item.label} className="surface-soft rounded-xl px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  {item.label}
                </p>
                <p className="mt-1 text-lg font-semibold text-white light:text-slate-900">
                  {item.value}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">{item.hint}</p>
              </div>
            ))}
          </div>
        </section>

        {error ? (
          <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {getApiErrorMessage(error, "Could not load notifications right now.")}
          </p>
        ) : null}

        <section className="space-y-2">
          {notifications.length === 0 ? (
            <div className="xcr8-panel rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-cyan-500/10 p-2 text-cyan-300">
                  <Bell size={18} />
                </div>
                <div>
                  <h2 className="xcr8-title-lg text-white light:text-slate-900">
                    No notifications yet
                  </h2>
                  <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
                    New items will appear here and can be opened directly from the list.
                  </p>
                  <Link
                    href="/dashboard"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700"
                  >
                    <Sparkles size={15} />
                    Back to home
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            notifications.map((item: IntelligenceNotification) => (
              <article
                key={item.id}
                className={`xcr8-panel rounded-2xl border p-4 transition hover:bg-white/5 light:border-slate-200 ${selectedNotification?.id === item.id ? "border-cyan-300/40 bg-cyan-500/5" : "border-white/10"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="xcr8-title-lg truncate text-white light:text-slate-900">
                        {item.title}
                      </h2>
                      {item.is_read ? null : (
                        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-cyan-300" />
                      )}
                    </div>
                    <p className="mt-2 text-sm text-slate-300 light:text-slate-700">{item.body}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {formatCreatedAt(item.created_at)}
                      {item.related_topic ? ` • ${item.related_topic}` : ""}
                    </p>
                  </div>

                  <div
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${severityStyles[item.severity] ?? severityStyles.info}`}
                  >
                    {item.severity}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  {item.is_read ? (
                    <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <CheckCheck size={13} />
                      Read
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 text-xs text-cyan-300">
                      <Sparkles size={13} />
                      Unread
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => openNotification(item.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700"
                  >
                    Open
                    <ArrowUpRight size={12} />
                  </button>
                </div>
              </article>
            ))
          )}
        </section>

        {selectedNotification ? (
          <section className="xcr8-panel rounded-2xl border border-cyan-300/25 p-5">
            <p className="xcr8-soft-chip mb-2 inline-flex items-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
              Opened notification
            </p>
            <h2 className="xcr8-title-lg text-white light:text-slate-900">
              {selectedNotification.title}
            </h2>
            <p className="mt-2 text-sm text-slate-300 light:text-slate-700">
              {selectedNotification.body}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {formatCreatedAt(selectedNotification.created_at)}
              {selectedNotification.related_topic ? ` • ${selectedNotification.related_topic}` : ""}
            </p>
          </section>
        ) : null}
      </div>
    </MobileShell>
  );
}
