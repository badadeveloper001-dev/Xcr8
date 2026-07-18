"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { getIntelligenceFeed } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

export function NotificationBellButton() {
  const hasHydrated = useCreatorStore((state) => state.hasHydrated);
  const userId = useCreatorStore((state) => state.userId);

  const { data } = useQuery({
    queryKey: ["notifications-badge", userId],
    queryFn: () => getIntelligenceFeed(userId as number, { limit: 12 }),
    enabled: Boolean(hasHydrated && userId),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const unreadCount = data?.notifications.filter((item) => !item.is_read).length ?? 0;

  return (
    <Link
      href="/notifications"
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur transition hover:scale-[1.03] light:border-slate-200 light:bg-white light:text-slate-700"
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
