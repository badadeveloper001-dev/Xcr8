"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Calendar, CalendarDays, Clock3, Plus } from "lucide-react";
import Link from "next/link";
import { MobileShell } from "@/components/mobile-shell";
import { getCalendar } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

const platformColors: Record<string, string> = {
  instagram: "badge-ig",
  tiktok: "badge-tk",
  x: "badge-x",
  facebook: "badge-fb",
  linkedin: "badge-li",
  youtube_shorts: "badge-yt",
};
const platformShort: Record<string, string> = {
  instagram: "IG",
  tiktok: "TK",
  x: "X",
  facebook: "f",
  linkedin: "LI",
  youtube_shorts: "YT",
};

function formatSchedule(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  };
}

export default function CalendarPage() {
  const router = useRouter();
  const userId = useCreatorStore((s) => s.userId);

  useEffect(() => {
    if (!userId) router.replace("/auth/login");
  }, [router, userId]);

  const { data } = useQuery({
    queryKey: ["calendar", userId],
    queryFn: () => getCalendar(userId as number),
    enabled: Boolean(userId),
  });

  if (!userId) return null;

  const items = data?.items ?? [];

  return (
    <MobileShell title="Scheduled" subtitle="Your upcoming publishing queue.">
      <p className="section-kicker mb-3">Publishing timeline</p>
      {!data && (
        <div className="mb-4 space-y-2" aria-hidden="true">
          <div className="skeleton h-20 rounded-2xl" />
          <div className="skeleton h-20 rounded-2xl" />
        </div>
      )}

      {items.length > 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="space-y-2.5"
        >
          {items.map((item, idx) => {
            const { date, time } = formatSchedule(item.scheduled_for);
            const badgeCls = platformColors[item.platform] ?? "bg-slate-700";
            const short = platformShort[item.platform] ?? item.platform.slice(0, 2).toUpperCase();
            return (
              <motion.article
                key={item.schedule_id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                className="surface-card cyber-grid neon-ring flex items-center gap-4 rounded-2xl p-4"
              >
                {/* Date block */}
                <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-violet-500/15 light:bg-violet-100">
                  <p className="text-xs font-medium text-violet-400 light:text-violet-600">
                    {date.split(" ")[0]}
                  </p>
                  <p className="text-xl font-bold leading-none text-white light:text-slate-900">
                    {date.split(" ")[1]}
                  </p>
                  <p className="text-[10px] text-violet-400 light:text-violet-600">
                    {date.split(" ")[2]}
                  </p>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full text-[9px] font-bold text-white ${badgeCls}`}
                    >
                      {short}
                    </span>
                    <p className="text-sm font-semibold text-white light:text-slate-900">
                      Post #{item.post_id}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock3 size={11} /> {time}
                    </span>
                    <span className="text-xs text-slate-500">{item.timezone}</span>
                  </div>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                    item.status === "published" ? "pill-published" : "pill-scheduled"
                  }`}
                >
                  {item.status}
                </span>
              </motion.article>
            );
          })}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="surface-luxe flex flex-col items-center rounded-2xl p-10 text-center"
        >
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-violet-500/15 text-violet-400 light:bg-violet-100 light:text-violet-600">
            <CalendarDays size={28} />
          </div>
          <h3 className="mb-1 text-lg font-bold text-white light:text-slate-900">
            No posts scheduled yet
          </h3>
          <p className="mb-5 text-sm text-slate-400 light:text-slate-500">
            Approve a draft in Compose and queue it here.
          </p>
          <Link
            href="/compose"
            className="cta-btn inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold"
          >
            <Plus size={15} /> Create a Post
          </Link>
        </motion.div>
      )}

      {/* Mini calendar hint */}
      <div className="mt-5 surface-soft rounded-2xl p-4">
        <p className="section-kicker mb-2">Schedule context</p>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/15 text-violet-400 light:bg-violet-100 light:text-violet-600">
            <Calendar size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold text-white light:text-slate-900">
              Timezone: Africa/Lagos
            </p>
            <p className="text-xs text-slate-500">All schedules use your local timezone (WAT).</p>
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
