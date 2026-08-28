"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

export function NotificationBellButton() {
  const hasHydrated = useCreatorStore((state) => state.hasHydrated);
  const userId = useCreatorStore((state) => state.userId);
  const activeCreatorId = useCreatorStore((state) => state.activeCreatorId);

  const { data } = useQuery({
    queryKey: ["notification-count", userId, activeCreatorId],
    queryFn: async ({ signal }) => (await apiClient.get<{ unread_count: number }>(
      `/api/v1/intelligence/notifications/${userId}`, { params: { limit: 1 }, signal },
    )).data,
    enabled: Boolean(hasHydrated && userId),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const unreadCount = data?.unread_count ?? 0;

  return (
    <Link
      href="/notifications"
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur transition hover:scale-[1.03] light:border-slate-200 light:bg-white light:text-slate-700"
      aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
      title={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}
    >
      <Bell size={16} />
      {unreadCount > 0 ? (
        <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-cyan-400 px-1 text-[9px] font-bold leading-none text-slate-950 shadow-md">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
