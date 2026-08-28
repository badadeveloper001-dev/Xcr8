"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueries, useQuery } from "@tanstack/react-query";
import { BarChart3, RefreshCw, Download, ExternalLink } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { apiClient, getApiErrorMessage } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";
import { platformLabels, platformMetrics, metricNumber, safeSourceUrl, displayDate } from "@/lib/reporting-ui";

type LiveAccount = {
  connection_id?: number;
  platform: string;
  handle: string;
  status: string;
  message?: string;
  fetched_at?: string;
  data: Record<string, unknown>;
};
type LiveResponse = { fetched_at: string; platforms: LiveAccount[] };
type Snapshot = { platform: string; engagement_rate: number; followers_delta: number; caption_effectiveness: number };
type Overview = {
  engagement: Snapshot[];
  platform_playbooks?: Array<{ platform: string; best_posting_hour: number | null; snapshot_count: number; recommended_test: string }>;
  data_quality?: { message: string };
};
const platforms = Object.keys(platformLabels);

function AccountCard({ account }: { account: LiveAccount }) {
  const [expanded, setExpanded] = useState(false);
  const values = account.data || {};
  const insightErrors = values.insight_errors && typeof values.insight_errors === "object" ? values.insight_errors as Record<string, unknown> : {};
  const warnings = Array.isArray(values.warnings) ? values.warnings.filter((v): v is string => typeof v === "string") : [];
  const posts = Array.isArray(values.recent_posts)
    ? values.recent_posts.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object") : [];
  const details = values.metric_details && typeof values.metric_details === "object"
    ? values.metric_details as Record<string, { coverage?: string; end_time?: string }> : {};
  const ready = account.status === "ok";
  const statusLabel = ready ? (warnings.length ? "Partial data" : "Synced")
    : account.status === "manual" ? "Connect with OAuth" : "Needs attention";
  return (
    <article className="xcr8-panel min-w-0 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-white light:text-slate-900">{platformLabels[account.platform]}</h2>
          <p className="break-words text-sm text-slate-400">{account.handle}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${ready && !warnings.length ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-500"}`}>{statusLabel}</span>
      </div>
      {ready ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2">
            {(platformMetrics[account.platform] || []).map(([key, label, coverage]) => {
              const value = metricNumber(values[key]);
              return <div key={key} className="surface-soft min-w-0 rounded-xl p-3">
                <dt className="text-xs text-slate-400">{label}</dt>
                <dd className="mt-1 break-words text-xl font-semibold text-white light:text-slate-900">{value === null ? "—" : value.toLocaleString()}</dd>
                <p className="mt-1 text-[11px] text-slate-500">{value === null ? "Not returned by platform" : coverage}</p>
                {value !== null && details[key]?.coverage ? <p className="mt-1 text-[11px] text-slate-500">{details[key].coverage}{details[key].end_time ? ` · ending ${displayDate(details[key].end_time)}` : ""}</p> : null}
              </div>;
            })}
          </dl>
          {Object.keys(insightErrors).length > 0 ? <p className="mt-3 text-xs text-amber-500">Some account metrics were declined by the provider; reconnect with the required insights permission if you need them.</p> : null}
          {warnings.map((warning) => <p key={warning} className="mt-3 text-xs text-amber-500">{warning}</p>)}
          {account.platform === "facebook" ? <p className="mt-3 text-xs text-slate-500">Reach and watch-time availability depends on your Page permissions and what Meta exposes. Values above are provider-reported; a dash means Meta did not return that metric.</p> : null}
          {account.platform === "youtube_shorts" ? <p className="mt-3 text-xs text-slate-500">These are channel statistics. Watch time, retention and a Shorts-only breakdown are not available in this report.</p> : null}
          {posts.length > 0 ? <div className="mt-4 border-t border-white/10 pt-3 light:border-slate-200">
            <h3 className="text-sm font-semibold text-white light:text-slate-900">Recent posts</h3>
            <p className="mt-1 text-xs text-slate-500">Newest first · a sample of up to 10 posts, not a complete history.</p>
            <ul className="mt-2 space-y-2">
              {posts.slice(0, expanded ? posts.length : 3).map((post, i) => {
                const url = safeSourceUrl(post.permalink);
                return <li key={String(post.id || i)} className="surface-soft rounded-xl p-3">
                  <p className="line-clamp-2 break-words text-sm text-slate-200 light:text-slate-800">{String(post.caption || post.media_type || "Untitled post")}</p>
                  <p className="mt-1 text-xs text-slate-500">{displayDate(typeof post.timestamp === "string" ? post.timestamp : null)}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                    <span>Likes: {metricNumber(post.like_count)?.toLocaleString() ?? "—"}</span>
                    <span>Comments: {metricNumber(post.comments_count)?.toLocaleString() ?? "—"}</span>
                    {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-violet-400">View post <ExternalLink size={12} /></a> : null}
                  </div>
                </li>;
              })}
            </ul>
            {posts.length > 3 ? <button type="button" onClick={() => setExpanded(!expanded)} className="mt-2 min-h-11 text-sm text-violet-400">{expanded ? "Show fewer posts" : `See all ${posts.length} sampled posts`}</button> : null}
          </div> : null}
        </>
      ) : <div className="mt-3 space-y-2">
        <p className="text-sm text-amber-500">{account.message || (typeof values.error === "string" ? values.error : "This account did not return analytics. Reconnect or refresh to try again.")}</p>
        <Link href="/settings#connected-platforms" className="inline-flex min-h-11 items-center text-sm text-violet-400">Review connection</Link>
      </div>}
      {account.fetched_at ? <p className="mt-3 text-[11px] text-slate-500">Retrieved {displayDate(account.fetched_at)}. Platforms may report with a delay.</p> : null}
    </article>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const userId = useCreatorStore(s => s.userId);
  const hasHydrated = useCreatorStore(s => s.hasHydrated);
  const activeCreatorId = useCreatorStore(s => s.activeCreatorId);
  const [selected, setSelected] = useState("all");
  const [window, setWindow] = useState("30d");
  useEffect(() => { if (hasHydrated && !userId) router.replace("/auth/login"); }, [hasHydrated, userId, router]);
  const live = useQueries({ queries: platforms.map(platform => ({
    queryKey: ["analytics-live", userId, activeCreatorId, platform],
    queryFn: async ({ signal }: { signal: AbortSignal }) => (await apiClient.get<LiveResponse>(`/api/v1/analytics/live/${userId}`, { params: { platform }, signal, timeout: 55000 })).data,
    enabled: hasHydrated && Boolean(userId),
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })) });
  const overview = useQuery({
    queryKey: ["analytics", userId, activeCreatorId, window],
    queryFn: async ({ signal }) => (await apiClient.get<Overview>(`/api/v1/analytics/overview/${userId}`, { params: { window }, signal })).data,
    enabled: hasHydrated && Boolean(userId),
  });
  if (!hasHydrated || !userId) return null;
  const accounts = live.flatMap(query => query.data?.platforms || []);
  const visible = accounts.filter(account => selected === "all" || account.platform === selected);
  const snapshots = (overview.data?.engagement || []).filter(row => platforms.includes(row.platform) && (selected === "all" || row.platform === selected));
  const busy = live.some(query => query.isFetching);
  const exportReport = () => {
    const payload = { exported_at: new Date().toISOString(), selected_platform: selected, snapshot_window: window, accounts: visible, snapshots, note: "Account totals and recent samples are not filtered by the snapshot window. Missing metrics are unavailable, not zero." };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "xcr8-analytics.json"; link.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <MobileShell title="Analytics" subtitle="Understand what each connected account is reporting.">
    <div className="space-y-4">
      <section className="xcr8-panel rounded-2xl p-5">
        <h1 className="xcr8-title-xl text-white light:text-slate-900">Your platform performance</h1>
        <p className="mt-2 text-sm text-slate-400">Account totals and recent activity, with clear labels for what is—and isn't—available.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <select aria-label="Filter analytics by platform" className="xcr8-input min-h-11 min-w-0 flex-1 sm:flex-none" value={selected} onChange={e => setSelected(e.target.value)}>
            <option value="all">All platforms</option>{platforms.map(p => <option key={p} value={p}>{platformLabels[p]}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={() => { void Promise.all(live.map(q => q.refetch())); }} className="surface-soft inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm disabled:opacity-50"><RefreshCw size={15} className={busy ? "animate-spin" : ""} />{busy ? "Syncing…" : "Refresh accounts"}</button>
          <button type="button" disabled={!visible.length && !snapshots.length} onClick={exportReport} className="surface-soft inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm disabled:opacity-50"><Download size={15} />Export</button>
        </div>
      </section>
      {live.map((query, i) => {
        const platform = platforms[i];
        if (!platform || (selected !== "all" && selected !== platform)) return null;
        const label = platformLabels[platform] ?? platform;
        if (query.isPending) {
          return <p key={platform} role="status" className="surface-soft rounded-xl p-4 text-sm">Loading {label}…</p>;
        }
        if (query.isError) {
          return <div key={platform} role="alert" className="surface-soft rounded-xl p-4 text-sm text-amber-500">{label}: {getApiErrorMessage(query.error, "Could not retrieve analytics.")}<button type="button" onClick={() => void query.refetch()} className="ml-3 min-h-11 underline">Retry</button></div>;
        }
        return null;
      })}
      <div className="grid items-start gap-4 lg:grid-cols-2">{visible.map((account, i) => <AccountCard key={`${activeCreatorId}-${account.connection_id ?? account.platform + account.handle + i}`} account={account} />)}</div>
      {!busy && !visible.length && !live.some(q => q.isError) ? <section className="xcr8-panel rounded-2xl p-6 text-center"><BarChart3 className="mx-auto mb-2 text-violet-400" /><p>No connected accounts {selected !== "all" ? `for ${platformLabels[selected]}` : "yet"}.</p><Link href="/settings#connected-platforms" className="mt-2 inline-flex min-h-11 items-center text-violet-400">Connect an account</Link></section> : null}
      <section className="xcr8-panel rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white light:text-slate-900">Saved reporting windows</h2>
          <select aria-label="Saved analytics reporting window" value={window} onChange={e => setWindow(e.target.value)} className="xcr8-input min-h-11">{["7d", "30d", "90d"].map(w => <option key={w} value={w}>{w.replace("d", "-day snapshots")}</option>)}</select>
        </div>
        <p className="mt-2 text-xs text-slate-500">Latest saved snapshot per platform for this window. This selector does not change lifetime totals or recent samples above.</p>
        {overview.isPending ? <p role="status" className="mt-3 text-sm">Loading saved reports…</p> : overview.isError ? <p role="alert" className="mt-3 text-sm text-amber-500">Saved reports couldn't load. <button type="button" onClick={() => void overview.refetch()} className="min-h-11 underline">Retry</button></p> : !snapshots.length ? <p className="mt-3 text-sm text-slate-400">No saved snapshots for this selection. Live account data above is separate.</p> :
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{snapshots.map(row => {
            const playbook = overview.data?.platform_playbooks?.find(p => p.platform === row.platform);
            return <article key={row.platform} className="surface-soft rounded-xl p-3">
              <h3 className="font-semibold">{platformLabels[row.platform]}</h3>
              <p className="mt-2 text-sm">Recorded engagement: {(row.engagement_rate * 100).toFixed(1)}%</p>
              <p className="text-sm">Follower change: {row.followers_delta > 0 ? "+" : ""}{row.followers_delta}</p>
              <p className="mt-2 text-xs text-slate-500">{playbook?.snapshot_count ?? 1} saved snapshots. {playbook?.best_posting_hour != null ? `Recorded posting-hour suggestion: ${String(playbook.best_posting_hour).padStart(2, "0")}:00 (source timezone not recorded). Treat this as a test, not a confirmed best time.` : "Not enough posting-time data for a reliable recommendation."}</p>
            </article>;
          })}</div>}
      </section>
      <section className="surface-soft rounded-2xl p-4 text-sm text-slate-400">
        <h2 className="font-semibold text-white light:text-slate-900">Why did a post perform well?</h2>
        <p className="mt-2">Likes and comments show reactions, not the cause of virality. Saves, shares, retention and comparable post-level reach are needed before Xcr8 can explain a breakout or recommend a dependable best posting time. Unavailable metrics are shown as —, never invented.</p>
      </section>
    </div>
  </MobileShell>;
}
