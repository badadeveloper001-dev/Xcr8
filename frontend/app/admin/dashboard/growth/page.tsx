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

type ReferralManagement = {
  campaigns: { id: number; name: string; code: string; status: string; attribution_window_days: number; url: string }[];
  influencers: { id: number; name: string; code: string | null; status: string; campaign_id: number | null; attribution_window_days: number; url: string }[];
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
      {showCreate && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="create-referral-title" className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="xcr8-eyebrow">Growth</p><h2 id="create-referral-title" className="mt-1 text-xl font-semibold">Create Referral</h2></div>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-white/10 px-3 py-1 text-sm">Close</button>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="text-sm">Type<select value={createType} onChange={(e) => { setCreateType(e.target.value as "campaign" | "influencer"); resetCreateForm(); }} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"><option value="campaign">Campaign</option><option value="influencer">Influencer</option></select></label>
              <label className="text-sm">{createType === "campaign" ? "Campaign name" : "Influencer name"}<input value={createName} onChange={(e) => setCreateName(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2" placeholder={createType === "campaign" ? "October Creator Campaign" : "Amina"} /></label>
              <label className="text-sm">{createType === "campaign" ? "Campaign code (optional)" : "Referral code (optional)"}<input value={createCode} onChange={(e) => setCreateCode(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2" placeholder="Leave blank to generate" /></label>
              {createType === "influencer" && (
                <label className="text-sm">Campaign (optional)<select value={createCampaignId} onChange={(e) => setCreateCampaignId(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"><option value="">No campaign</option>{sources.campaigns.map((row) => <option key={row.source_id} value={row.source_id}>{row.name}</option>)}</select></label>
              )}
              <label className="text-sm">Attribution window (days)<input type="number" min="1" max="3650" value={createAttributionDays} onChange={(e) => setCreateAttributionDays(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2" /></label>
              {createError && <p role="alert" className="rounded-lg bg-red-900/30 p-3 text-sm">{createError}</p>}
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm">Cancel</button><button type="button" disabled={createBusy || createName.trim().length < 2} onClick={() => void submitReferral()} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm disabled:opacity-50">{createBusy ? "Creating…" : "Create"}</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GrowthDashboard() {
  const [days, setDays] = useState(30);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [sources, setSources] = useState<SourceDetails | null>(null);
  const [referrals, setReferrals] = useState<ReferralManagement | null>(null);
  const [tab, setTab] = useState<"overview" | "sources" | "network">("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<"campaign" | "influencer">("campaign");
  const [createName, setCreateName] = useState("");
  const [createCode, setCreateCode] = useState("");
  const [createCampaignId, setCreateCampaignId] = useState("");
  const [createAttributionDays, setCreateAttributionDays] = useState("30");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdReferral, setCreatedReferral] = useState<{ name: string; url: string; code: string } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState("");


  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      const [snapshotResponse, sourceResponse, referralResponseRaw] = await Promise.all([
        fetch(`/admin/data/growth?days=${days}`, { cache: "no-store" }),
        fetch(`/admin/data/growth/sources?days=${days}`, { cache: "no-store" }),
        fetch("/admin/data/growth/referrals", { cache: "no-store" }),
      ]);
      const snapshotBody = await snapshotResponse.json();
      const sourceBody = await sourceResponse.json();
      const referralResponse = await referralResponseRaw.json();
      
      if (!snapshotResponse.ok) throw new Error(snapshotBody.detail || "Unable to load Growth reporting.");
      if (!sourceResponse.ok) throw new Error(sourceBody.detail || "Unable to load Growth source reporting.");
      if (!referralResponseRaw.ok) throw new Error(referralResponse.detail || "Unable to load Growth referral management.");
      setSnapshot(snapshotBody);
      setSources(sourceBody);
      setReferrals(referralResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Growth reporting.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void refresh(); }, [days]);
  const setReferralStatus = async (sourceType: "campaign" | "influencer", sourceId: number, currentStatus: string) => {
    try {
      const nextStatus = currentStatus === "active" ? "inactive" : "active";
      const response = await fetch(`/admin/data/growth/referrals/status?source_type=${sourceType}&source_id=${sourceId}&status=${nextStatus}`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "Unable to update referral status.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update referral status.");
    }
  };

  const resetCreateForm = () => {
    setCreateName("");
    setCreateCode("");
    setCreateCampaignId("");
    setCreateAttributionDays("30");
    setCreateError("");
    setCreatedReferral(null);
  };

  const submitReferral = async () => {
    setCreateBusy(true);
    setCreateError("");
    setCreatedReferral(null);
    try {
      const endpoint = createType === "campaign" ? "/admin/data/growth/campaigns" : "/admin/data/growth/influencers";
      const body = createType === "campaign"
        ? { name: createName.trim(), campaign_code: createCode.trim() || undefined, attribution_window_days: Number(createAttributionDays) }
        : {
            influencer_name: createName.trim(),
            referral_code: createCode.trim() || undefined,
            campaign_id: createCampaignId ? Number(createCampaignId) : undefined,
            attribution_window_days: Number(createAttributionDays),
          };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Unable to create referral.");
      setCreatedReferral({
        name: createType === "campaign" ? result.name : result.influencer_name,
        url: result.url,
        code: createType === "campaign" ? result.campaign_code : result.referral_code,
      });
      await refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Unable to create referral.");
    } finally {
      setCreateBusy(false);
    }
  };

  const copyReferral = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    window.setTimeout(() => setCopiedUrl(""), 1800);
  };


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
          <button
            type="button"
            onClick={() => { resetCreateForm(); setShowCreate(true); }}
            className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-300"
          >
            + Create Referral
          </button>
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
              <section className={panel}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h2 className="font-semibold">Referral management</h2><p className="mt-1 text-sm text-slate-400">Created campaign and influencer links.</p></div>
                  <button type="button" onClick={() => { resetCreateForm(); setShowCreate(true); }} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm">Create Referral</button>
                </div>
                {createdReferral && (
                  <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
                    <p className="font-medium text-emerald-300">Referral created</p>
                    <p className="mt-1 text-sm">{createdReferral.name} · {createdReferral.code}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <code className="min-w-0 flex-1 rounded-lg bg-black/20 px-3 py-2 text-xs break-all">{createdReferral.url}</code>
                      <button type="button" onClick={() => void copyReferral(createdReferral.url)} className="rounded-lg border border-white/10 px-3 py-2 text-xs">{copiedUrl === createdReferral.url ? "Copied" : "Copy Link"}</button>
                    </div>
                  </div>
                )}
                <div className="mt-5 space-y-4">
                  <div><p className="mb-2 text-xs uppercase tracking-wider text-slate-500">Campaigns</p>{referrals?.campaigns.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center gap-3 border-t border-white/5 py-3">
                      <div className="min-w-[180px] flex-1"><p className="font-medium">{row.name}</p><p className="text-xs text-slate-500">{row.code} · {row.status}</p></div>
                      <button type="button" onClick={() => void copyReferral(row.url)} className="rounded-lg border border-white/10 px-3 py-2 text-xs">{copiedUrl === row.url ? "Copied" : "Copy Link"}</button>
                      <button type="button" onClick={() => void setReferralStatus("campaign", row.id, row.status)} className="rounded-lg border border-white/10 px-3 py-2 text-xs">{row.status === "active" ? "Deactivate" : "Activate"}</button>
                    </div>
                  ))}</div>
                  <div><p className="mb-2 text-xs uppercase tracking-wider text-slate-500">Influencers</p>{referrals?.influencers.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center gap-3 border-t border-white/5 py-3">
                      <div className="min-w-[180px] flex-1"><p className="font-medium">{row.name}</p><p className="text-xs text-slate-500">{row.code || "—"} · {row.status}</p></div>
                      {row.code && <button type="button" onClick={() => void copyReferral(row.url)} className="rounded-lg border border-white/10 px-3 py-2 text-xs">{copiedUrl === row.url ? "Copied" : "Copy Link"}</button>}
                      <button type="button" onClick={() => void setReferralStatus("influencer", row.id, row.status)} className="rounded-lg border border-white/10 px-3 py-2 text-xs">{row.status === "active" ? "Deactivate" : "Activate"}</button>
                    </div>
                  ))}</div>
                </div>
              </section>
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
