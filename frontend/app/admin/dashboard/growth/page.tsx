"use client";

import { useEffect, useMemo, useState } from "react";

type Snapshot = {
  window: { days: number; start: string; end: string };
  funnel: {
    referral_clicks: number;
    watermark_clicks: number;
    signups: number;
    attributed_signups: number;
    organic_signups: number;
    activations: number;
    paid_users: number;
    signup_to_activation_rate: number | null;
    activation_to_paid_rate: number | null;
  };
  lifecycle_events: Record<string, number>;
  sources: { source_type: string; users: number; activated: number; paid: number }[];
  cohorts: Record<string, { eligible_signups: number; activated: number; paid: number; activation_rate: number | null; paid_rate: number | null }>;
  revenue: {
    total_minor: null;
    by_currency: { currency: string; amount_minor: number; payments: number }[];
    by_first_touch: { source_type: string; currency: string; amount_minor: number; payments: number }[];
    note: string;
  };
  free_economics: { new_free_users: number; estimated_external_cost: number; note: string };
  limitations: string[];
};

type SourceRow = {
  source_id: number;
  name: string;
  source_type: string;
  clicks: number;
  signups: number;
  activated: number;
  paid_users: number;
  revenue_by_currency: Record<string, number>;
};

type SourceDetails = {
  campaigns: SourceRow[];
  influencers: SourceRow[];
  user_referrals: SourceRow[];
  watermarks: SourceRow[];
  referral_relationships: {
    referrer_user_id: number;
    referrer_name: string;
    referred_user_id: number;
    referred_name: string;
    referral_code: string | null;
    chain_depth: number;
    created_at: string | null;
  }[];
};

const panel = "rounded-2xl border border-white/10 bg-white/5 p-5";
const pct = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;
const number = (value: number) => new Intl.NumberFormat().format(value);
const money = (value: number, currency: string) => {
  const major = value / 100;
  return `${currency} ${major.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <section className={panel}>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      {detail && <p className="mt-2 text-xs text-slate-500">{detail}</p>}
    </section>
  );
}

function SourceTable({ rows, empty }: { rows: SourceRow[]; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-slate-400">
          <tr>
            {["Source", "Clicks", "Signups", "Activated", "Paid", "Verified revenue"].map((item) => (
              <th key={item} className="px-3 py-3">{item}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.source_type + row.source_id} className="border-t border-white/5">
              <td className="px-3 py-3">
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-slate-500">{row.source_type} · #{row.source_id}</p>
              </td>
              <td className="px-3 py-3">{number(row.clicks)}</td>
              <td className="px-3 py-3">{number(row.signups)}</td>
              <td className="px-3 py-3">{number(row.activated)}</td>
              <td className="px-3 py-3">{number(row.paid_users)}</td>
              <td className="px-3 py-3">
                {Object.keys(row.revenue_by_currency).length
                  ? Object.entries(row.revenue_by_currency).map(([currency, amount]) => (
                      <div key={currency}>{money(amount, currency)}</div>
                    ))
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="py-3 text-sm text-slate-400">{empty}</p>}
    </div>
  );
}

export default function GrowthDashboard() {
  const [days, setDays] = useState(30);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [sources, setSources] = useState<SourceDetails | null>(null);
  const [tab, setTab] = useState<"overview" | "sources" | "network">("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      const [snapshotResponse, sourceResponse] = await Promise.all([
        fetch(`/admin/data/growth?days=${days}`, { cache: "no-store" }),
        fetch(`/admin/data/growth/sources?days=${days}`, { cache: "no-store" }),
      ]);
      const snapshotBody = await snapshotResponse.json();
      const sourceBody = await sourceResponse.json();
      if (!snapshotResponse.ok) throw new Error(snapshotBody.detail || "Unable to load Growth reporting.");
      if (!sourceResponse.ok) throw new Error(sourceBody.detail || "Unable to load Growth source reporting.");
      setSnapshot(snapshotBody);
      setSources(sourceBody);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Growth reporting.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void refresh(); }, [days]);

  const lifecycle = useMemo(
    () => Object.entries(snapshot?.lifecycle_events ?? {}),
    [snapshot],
  );

  return (
    <div className="space-y-5 text-slate-100 light:text-slate-900">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="xcr8-eyebrow">Acquisition & lifecycle</p>
          <h1 className="mt-1 text-2xl font-semibold">Growth</h1>
          <p className="mt-1 text-sm text-slate-400">
            Backend-attributed acquisition, activation, referrals and verified payment economics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
            aria-label="Growth reporting window"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>365 days</option>
          </select>
          <button disabled={busy} onClick={() => void refresh()} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm disabled:opacity-50">
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl bg-red-900/30 p-4">{error}</p>}

      {snapshot && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Signups" value={number(snapshot.funnel.signups)} detail={`${number(snapshot.funnel.attributed_signups)} attributed · ${number(snapshot.funnel.organic_signups)} organic`} />
            <Metric label="Activations" value={number(snapshot.funnel.activations)} detail={`${pct(snapshot.funnel.signup_to_activation_rate)} of signups`} />
            <Metric label="Paid users" value={number(snapshot.funnel.paid_users)} detail={`${pct(snapshot.funnel.activation_to_paid_rate)} of activated users`} />
            <Metric label="Acquisition clicks" value={number(snapshot.funnel.referral_clicks + snapshot.funnel.watermark_clicks)} detail={`${number(snapshot.funnel.referral_clicks)} referral · ${number(snapshot.funnel.watermark_clicks)} watermark`} />
          </div>

          <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            {(["overview", "sources", "network"] as const).map((item) => (
              <button key={item} onClick={() => setTab(item)} className={`rounded-lg px-4 py-2 text-sm capitalize ${tab === item ? "bg-cyan-600 text-white" : "text-slate-400"}`}>
                {item}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="grid gap-5 lg:grid-cols-2">
              <section className={panel}>
                <h2 className="font-semibold">Cohorts</h2>
                <p className="mt-1 text-sm text-slate-400">Only cohorts old enough to have completed each window are included.</p>
                <div className="mt-4 space-y-3">
                  {Object.entries(snapshot.cohorts).map(([key, cohort]) => (
                    <div key={key} className="rounded-xl border border-white/10 p-4">
                      <div className="flex items-center justify-between">
                        <strong>{key}</strong>
                        <span className="text-xs text-slate-500">{number(cohort.eligible_signups)} eligible</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div><p className="text-xs text-slate-500">Activated</p><p className="font-semibold">{number(cohort.activated)} · {pct(cohort.activation_rate)}</p></div>
                        <div><p className="text-xs text-slate-500">Paid</p><p className="font-semibold">{number(cohort.paid)} · {pct(cohort.paid_rate)}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className={panel}>
                <h2 className="font-semibold">Verified revenue</h2>
                <p className="mt-1 text-sm text-slate-400">{snapshot.revenue.note}</p>
                <div className="mt-4 space-y-3">
                  {snapshot.revenue.by_currency.map((row) => (
                    <div key={row.currency} className="flex items-center justify-between rounded-xl border border-white/10 p-4">
                      <div><strong>{row.currency}</strong><p className="text-xs text-slate-500">{number(row.payments)} verified payments</p></div>
                      <span className="font-semibold">{money(row.amount_minor, row.currency)}</span>
                    </div>
                  ))}
                  {!snapshot.revenue.by_currency.length && <p className="text-sm text-slate-400">No verified payments in this window.</p>}
                </div>
              </section>

              <section className={panel}>
                <h2 className="font-semibold">Lifecycle events</h2>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {lifecycle.map(([event, count]) => (
                    <div key={event} className="rounded-xl border border-white/10 p-3">
                      <p className="text-xs text-slate-500">{title(event)}</p>
                      <p className="mt-1 text-xl font-semibold">{number(count)}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className={panel}>
                <h2 className="font-semibold">Free-user economics</h2>
                <p className="mt-1 text-sm text-slate-400">{snapshot.free_economics.note}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-slate-500">New free users</p><p className="mt-1 text-2xl font-semibold">{number(snapshot.free_economics.new_free_users)}</p></div>
                  <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-slate-500">Recorded provider cost</p><p className="mt-1 text-2xl font-semibold">{snapshot.free_economics.estimated_external_cost.toFixed(4)}</p></div>
                </div>
              </section>
            </div>
          )}

          {tab === "sources" && sources && (
            <div className="space-y-5">
              <section className={panel}><h2 className="mb-4 font-semibold">Campaigns</h2><SourceTable rows={sources.campaigns} empty="No campaign activity in this window." /></section>
              <section className={panel}><h2 className="mb-4 font-semibold">Influencers</h2><SourceTable rows={sources.influencers} empty="No influencer activity in this window." /></section>
              <section className={panel}><h2 className="mb-4 font-semibold">User referrals</h2><SourceTable rows={sources.user_referrals} empty="No user referral activity in this window." /></section>
              <section className={panel}><h2 className="mb-4 font-semibold">Watermarks</h2><SourceTable rows={sources.watermarks} empty="No watermark activity in this window." /></section>
            </div>
          )}

          {tab === "network" && sources && (
            <section className={panel}>
              <h2 className="font-semibold">Referral network</h2>
              <p className="mt-1 text-sm text-slate-400">Direct referral relationships are shown as recorded. Chain depth is calculated from the relationship graph.</p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-slate-400"><tr>{["Referrer", "Referred user", "Code", "Depth", "Created"].map((item) => <th key={item} className="px-3 py-3">{item}</th>)}</tr></thead>
                  <tbody>
                    {sources.referral_relationships.map((row) => (
                      <tr key={row.referred_user_id} className="border-t border-white/5">
                        <td className="px-3 py-3">{row.referrer_name} <span className="text-xs text-slate-500">#{row.referrer_user_id}</span></td>
                        <td className="px-3 py-3">{row.referred_name} <span className="text-xs text-slate-500">#{row.referred_user_id}</span></td>
                        <td className="px-3 py-3">{row.referral_code || "—"}</td>
                        <td className="px-3 py-3">{row.chain_depth}</td>
                        <td className="px-3 py-3">{row.created_at ? new Date(row.created_at).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!sources.referral_relationships.length && <p className="py-4 text-sm text-slate-400">No referral relationships recorded in this window.</p>}
              </div>
            </section>
          )}

          <p className="text-xs text-slate-500">
            Window: {new Date(snapshot.window.start).toLocaleDateString()} → {new Date(snapshot.window.end).toLocaleDateString()}. Revenue is shown in original currencies; mixed currencies are not combined.
          </p>
        </>
      )}
    </div>
  );
}
