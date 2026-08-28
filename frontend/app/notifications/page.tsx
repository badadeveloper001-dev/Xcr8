"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, ChevronLeft, ChevronRight, RefreshCw, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { apiClient, getApiErrorMessage, markIntelligenceNotificationRead, type IntelligenceNotification } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";
import { displayDate, notificationCategory } from "@/lib/reporting-ui";

type Inbox = { notifications: IntelligenceNotification[]; total: number; unread_count: number; has_more: boolean; selected: IntelligenceNotification | null };
const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const cache = useQueryClient();
  const userId = useCreatorStore(s => s.userId);
  const activeCreatorId = useCreatorStore(s => s.activeCreatorId);
  const hasHydrated = useCreatorStore(s => s.hasHydrated);
  const [category, setCategory] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const selectedId = Number(params.get("notification")) > 0 ? Number(params.get("notification")) : null;
  useEffect(() => { if (hasHydrated && !userId) router.replace("/auth/login"); }, [hasHydrated, userId, router]);
  useEffect(() => { setPage(0); setActionError(""); }, [activeCreatorId]);
  const inbox = useQuery({
    queryKey: ["notification-inbox", userId, activeCreatorId, category, unreadOnly, search, page, selectedId],
    queryFn: async ({ signal }) => (await apiClient.get<Inbox>(`/api/v1/intelligence/notifications/${userId}`, {
      signal, params: { category, unread_only: unreadOnly, q: search, offset: page * PAGE_SIZE, limit: PAGE_SIZE, selected_id: selectedId || undefined },
    })).data,
    enabled: hasHydrated && Boolean(userId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const items = inbox.data?.notifications || [];
  const selected = inbox.data?.selected;
  const markRead = async (rows: IntelligenceNotification[]) => {
    if (!userId || saving) return;
    const unread = rows.filter(row => !row.is_read);
    if (!unread.length) return;
    setSaving(true); setActionError("");
    // Limit concurrency; do not hammer the API with a burst of write requests.
    let failed = 0;
    for (let i = 0; i < unread.length; i += 3) {
      const results = await Promise.allSettled(unread.slice(i, i + 3).map(row => markIntelligenceNotificationRead(row.id, userId)));
      failed += results.filter(result => result.status === "rejected").length;
    }
    if (failed) setActionError(`${failed} notification(s) could not be marked read. Please retry.`);
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["notification-inbox", userId] }),
      cache.invalidateQueries({ queryKey: ["notifications", userId] }),
      cache.invalidateQueries({ queryKey: ["intelligence-feed", userId] }),
    ]);
    setSaving(false);
  };
  if (!hasHydrated || !userId) return null;
  return <MobileShell title="Notifications" subtitle="A calmer inbox for support updates and content opportunities.">
    <div className="space-y-4">
      <section className="xcr8-panel rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="xcr8-title-xl text-white light:text-slate-900">Your inbox</h1><p className="mt-1 text-sm text-slate-400">{inbox.data ? `${inbox.data.unread_count} unread notifications` : "Support updates and trend ideas, in one place."}</p></div>
          <button type="button" onClick={() => void inbox.refetch()} disabled={inbox.isFetching} className="surface-soft inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm disabled:opacity-50"><RefreshCw size={15} className={inbox.isFetching ? "animate-spin" : ""} />Refresh inbox</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Notification categories">
          {([["all", "All", Bell], ["support", "Pulse support", ShieldCheck], ["trends", "Trend updates", Sparkles]] as const).map(([value, label, Icon]) => <button key={value} type="button" aria-pressed={category === value} onClick={() => { setCategory(value); setPage(0); }} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm ${category === value ? "bg-violet-500/20 text-violet-400 ring-1 ring-violet-400/40" : "surface-soft text-slate-400"}`}><Icon size={15} />{label}</button>)}
        </div>
        <form onSubmit={event => { event.preventDefault(); setSearch(searchInput.trim()); setPage(0); }} className="mt-3 flex flex-wrap gap-2">
          <label className="min-w-0 flex-1"><span className="sr-only">Search all notifications</span><input value={searchInput} onChange={e => setSearchInput(e.target.value)} maxLength={100} placeholder="Search messages…" className="xcr8-input min-h-11 w-full min-w-0" /></label>
          <button type="submit" aria-label="Search notifications" className="surface-soft min-h-11 rounded-xl px-3"><Search size={18} /></button>
          <label className="inline-flex min-h-11 items-center gap-2 px-2 text-sm text-slate-400"><input type="checkbox" checked={unreadOnly} onChange={e => { setUnreadOnly(e.target.checked); setPage(0); }} />Unread only</label>
        </form>
        {search ? <button type="button" onClick={() => { setSearch(""); setSearchInput(""); setPage(0); }} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm text-violet-400">Clear search: {search}<X size={14} /></button> : null}
      </section>
      {(inbox.error || actionError) ? <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-400">{actionError || getApiErrorMessage(inbox.error, "Could not load your inbox.")}</p> : null}
      {selectedId && !inbox.isPending ? selected ? <section aria-labelledby="notification-detail-title" className="xcr8-panel rounded-2xl border border-violet-400/30 p-5">
        <div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-violet-400">{notificationCategory(selected.related_topic) === "support" ? "Pulse support update" : "Trend update"}</p><button type="button" aria-label="Close notification" onClick={() => router.replace("/notifications", { scroll: false })} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl"><X size={18} /></button></div>
        <h2 id="notification-detail-title" className="break-words text-lg font-semibold text-white light:text-slate-900">{selected.title}</h2>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300 light:text-slate-700">{selected.body}</p>
        <p className="mt-3 text-xs text-slate-500">{displayDate(selected.created_at)}{selected.related_topic ? ` · ${selected.related_topic}` : ""}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {!selected.is_read ? <button type="button" disabled={saving} onClick={() => void markRead([selected])} className="surface-soft inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm disabled:opacity-50"><CheckCheck size={15} />Mark as read</button> : <span className="inline-flex min-h-11 items-center gap-1 text-xs text-slate-500"><CheckCheck size={14} />Read</span>}
          {notificationCategory(selected.related_topic) === "trends" ? <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm text-violet-400">Explore current niche opportunities</Link> : null}
        </div>
      </section> : <p role="status" className="surface-soft rounded-xl p-4 text-sm">This notification is unavailable in the selected profile.</p> : null}
      {inbox.isPending ? <p role="status" className="xcr8-panel rounded-2xl p-6 text-center text-sm">Loading your inbox…</p> : inbox.data ? <>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400">
          <p>{inbox.data.total} matching messages</p>
          <button type="button" onClick={() => void markRead(items)} disabled={saving || !items.some(item => !item.is_read)} className="inline-flex min-h-11 items-center gap-1 text-violet-400 disabled:opacity-40"><CheckCheck size={15} />{saving ? "Saving…" : "Mark this page read"}</button>
        </div>
        {items.length ? <ul className="space-y-2">{items.map(item => {
          const support = notificationCategory(item.related_topic) === "support";
          const Icon = support ? ShieldCheck : Sparkles;
          return <li key={item.id}>
            <button type="button" onClick={() => router.replace(`/notifications?notification=${item.id}`, { scroll: false })} aria-expanded={selectedId === item.id} className={`xcr8-panel flex w-full min-w-0 gap-3 rounded-2xl border p-4 text-left transition hover:border-violet-400/40 ${item.is_read ? "border-transparent" : "border-violet-400/30"}`}>
              <span className={`mt-1 shrink-0 rounded-xl p-2 ${support ? "bg-cyan-500/10 text-cyan-400" : "bg-violet-500/10 text-violet-400"}`}><Icon size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><span className="text-[11px] text-slate-500">{support ? "Pulse support" : "Trend update"}</span>{!item.is_read ? <span className="text-[11px] font-semibold text-violet-400">Unread</span> : null}{["critical", "high"].includes(item.severity) ? <span className="rounded-full bg-rose-500/10 px-2 text-[11px] text-rose-400">Important</span> : null}</span>
                <span className="mt-1 block break-words font-semibold text-white light:text-slate-900">{item.title}</span>
                <span className="mt-1 line-clamp-2 break-words text-sm text-slate-400">{item.body}</span>
                <span className="mt-2 block text-[11px] text-slate-500">{displayDate(item.created_at)}</span>
              </span>
              <ChevronRight size={16} className="mt-2 shrink-0 text-slate-500" />
            </button>
          </li>;
        })}</ul> : <section className="xcr8-panel rounded-2xl p-8 text-center"><Bell className="mx-auto mb-3 text-violet-400" /><h2 className="font-semibold">{unreadOnly ? "You're all caught up" : "No matching notifications"}</h2><p className="mt-2 text-sm text-slate-400">Try changing your filters. New messages will appear here automatically.</p></section>}
        <nav aria-label="Inbox pages" className="flex items-center justify-between gap-2">
          <button type="button" disabled={page === 0 || inbox.isFetching} onClick={() => setPage(page - 1)} className="surface-soft inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm disabled:opacity-40"><ChevronLeft size={15} />Previous</button>
          <span className="text-xs text-slate-500">Page {page + 1}</span>
          <button type="button" disabled={!inbox.data.has_more || inbox.isFetching} onClick={() => setPage(page + 1)} className="surface-soft inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm disabled:opacity-40">Next<ChevronRight size={15} /></button>
        </nav>
      </> : null}
    </div>
  </MobileShell>;
}
