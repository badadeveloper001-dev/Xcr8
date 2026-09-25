"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Period = { cost_micros: number; active_users: number; cost_per_active_user_micros: number | null; unknown_attempts: number; unsettled_micros: number };
type Group = { name: string | number; cost_micros: number; attempts: number; fallbacks: number; unknown_attempts: number };
type Snapshot = {
  periods: Record<"day" | "week" | "month", Period>; features: Group[]; users: Group[]; revision: number;
  config: Record<string, unknown>;
  value_events: { feature: string; event: string; source: string; count: number }[];
  recent: { id: string; user_id: number; feature: string; provider: string; model: string; status: string; fallback: number; cost_micros: number | null; duration_ms: number | null; input_tokens: number | null; output_tokens: number | null; characters: number | null; images: number | null }[];
};
const money = (value: number | null) => value === null ? "Unknown" : `$${(value / 1000000).toFixed(4)}`;
const panel = "rounded-2xl border border-white/10 bg-white/5 p-5";

export default function PulseCostsPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [policy, setPolicy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const headers = () => ({ "Content-Type": "application/json" });
  const refresh = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/admin/data/pulse-costs", { headers: headers(), cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Unable to load cockpit.");
      setData(body); setPolicy(JSON.stringify(body.config, null, 2));
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load cockpit."); }
    finally { setBusy(false); }
  };
  useEffect(() => { void refresh(); }, []); // Manual refresh avoids continuous database polling.
  const save = async () => {
    if (!data) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/admin/data/pulse-costs", { method: "PATCH", headers: headers(), body: JSON.stringify({ revision: data.revision, config: JSON.parse(policy) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Check the policy fields.");
      setNotice("Policy saved. New requests use these rates and limits."); await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save policy."); }
    finally { setBusy(false); }
  };
  const groups = (title: string, rows: Group[]) => <section className={panel}><h2 className="mb-3 font-semibold">{title} · this month</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Name", "Cost", "Attempts", "Fallbacks", "Unknown"].map(x => <th key={x} className="p-2">{x}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.name}>{[row.name, money(row.cost_micros), row.attempts, row.fallbacks, row.unknown_attempts].map((x,i) => <td key={i} className="p-2">{x}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="p-2 text-slate-400">No usage recorded yet.</p>}</div></section>;
  return <div className="space-y-5 text-slate-100 light:text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/admin/dashboard/pulse" className="text-cyan-400">← Pulse</Link><h1 className="text-2xl font-semibold">Usage & cost cockpit</h1><p className="text-sm text-slate-400">Pilot · USD estimates · UTC calendar periods · week starts Monday</p></div><button disabled={busy} onClick={() => void refresh()} className="rounded-lg bg-cyan-600 px-4 py-2 disabled:opacity-50">{busy ? "Working…" : "Refresh"}</button></header>
    {error && <p role="alert" className="rounded-xl bg-red-900/30 p-4">{error}</p>}{notice && <p role="status">{notice}</p>}
    {data && <><div className="grid gap-4 md:grid-cols-3">{([["day", "Today"], ["week", "This week"], ["month", "This month"]] as const).map(([key, label]) => { const p = data.periods[key]; return <section key={key} className={panel}><h2>{label}</h2><p className="my-2 text-3xl font-semibold">{money(p.cost_micros)}</p><p>{p.active_users} active AI users · {p.active_users ? money(p.cost_per_active_user_micros) : "—"} / user</p><p className="mt-2 text-sm text-amber-400">{p.unknown_attempts} unknown attempts · {money(p.unsettled_micros)} reserved / unresolved</p></section>; })}</div>
    <p className="text-sm text-slate-400">Active user = a user with a successful AI request in that period. Unknown amounts are excluded from calculated spend. Failed or interrupted calls may still be billed by the provider.</p>
    {groups("Per-feature costs", data.features)}{groups("Top users by cost (user ID)", data.users)}
    <section className={panel}><h2 className="mb-3 font-semibold">Product value · this month</h2><p className="mb-3 text-sm text-slate-400">Generated outputs and unique download reports by feature. Published counts are server-confirmed post/platform events; they are not attributed to AI unless a generation link is available.</p><div className="grid gap-2 md:grid-cols-3">{data.value_events.map(v => <div key={`${v.feature}:${v.event}:${v.source}`} className="rounded-lg border border-white/10 p-3"><strong>{v.count} {v.event}</strong><p>{v.feature}</p><small>{v.source}</small></div>)}</div>{!data.value_events.length && <p>No value events recorded yet.</p>}</section>
    <section className={panel}><h2 className="mb-3 font-semibold">Recent provider attempts</h2><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{["User / feature", "Provider / model", "Result", "Units", "Duration", "Cost"].map(x => <th key={x} className="p-2">{x}</th>)}</tr></thead><tbody>{data.recent.map(r => <tr key={r.id}><td className="p-2">{r.user_id} / {r.feature}</td><td className="p-2">{r.provider} / {r.model}{r.fallback ? " (fallback)" : ""}</td><td className="p-2">{r.status}</td><td className="p-2">{r.input_tokens ?? "?"} in / {r.output_tokens ?? "?"} out; {r.characters ?? "—"} chars; {r.images ?? "—"} images</td><td className="p-2">{r.duration_ms ?? "—"} ms</td><td className="p-2">{money(r.cost_micros)}</td></tr>)}</tbody></table></div></section>
    <section className={panel}><h2 className="font-semibold">Budget policy & price catalog</h2><p className="my-3 text-sm text-slate-400">Observe records usage; enforce checks global, feature and user caps before each provider attempt. Limits are integer USD microdollars (1 USD = 1,000,000). Use user_limits.default for the default user cap. Unknown rates block paid calls in enforce mode. Image/character rates are estimates; verify current provider pricing before enforcing.</p><label htmlFor="policy" className="sr-only">Budget policy JSON</label><textarea id="policy" value={policy} onChange={e => setPolicy(e.target.value)} rows={18} spellCheck={false} className="w-full rounded-lg border border-slate-600 bg-slate-950 p-3 font-mono text-sm text-slate-100"/><button disabled={busy} onClick={() => void save()} className="mt-3 rounded-lg bg-cyan-600 px-4 py-2 disabled:opacity-50">Save policy</button></section>
    </>}
  </div>;
}
