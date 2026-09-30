"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Period = { cost_micros: number; active_users: number; cost_per_active_user_micros: number | null; unknown_attempts: number; unsettled_micros: number };
type Group = { name?: string | number; provider?: string; model?: string; cost_micros: number; attempts: number; fallbacks?: number; unknown_attempts: number };
type RequestRow = { request_id: string; user_id: number; feature: string; status: string; created_at: string; duration_ms: number | null; cost_micros: number; attempts: number; unknown_attempts: number };
type Snapshot = {
  periods: Record<"day" | "week" | "month" | "year", Period>;
  features: Group[]; users: Group[]; provider_models: Group[];
  user_features: { user_id: number; feature: string; cost_micros: number; attempts: number; unknown_attempts: number }[];
  requests: RequestRow[];
  recent: { id: string; user_id: number; feature: string; provider: string; model: string; status: string; fallback: number; cost_micros: number | null; duration_ms: number | null; input_tokens: number | null; output_tokens: number | null; cache_hit_tokens: number | null; cache_miss_tokens: number | null; billing_period: string | null }[];
};
const money = (value: number | null) => value === null ? "Unknown" : `$${(value / 1000000).toFixed(6)}`;
const panel = "rounded-2xl border border-white/10 bg-white/5 p-5";

export default function PulseCostsPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/admin/data/pulse-costs", { headers: { "Content-Type": "application/json" }, cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Unable to load cockpit.");
      setData(body);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load cockpit."); }
    finally { setBusy(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const table = (title: string, headers: string[], rows: (string | number)[][]) => (
    <section className={panel}><h2 className="mb-3 font-semibold">{title}</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{headers.map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((x,j)=><td key={j} className="p-2">{x}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="p-2 text-slate-400">No usage recorded yet.</p>}</div></section>
  );
  return <div className="space-y-5 text-slate-100 light:text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/admin/dashboard/pulse" className="text-cyan-400">← Pulse</Link><h1 className="text-2xl font-semibold">AI Cost Accounting</h1><p className="text-sm text-slate-400">Actual recorded usage where provider billing data is available · UTC periods</p></div><button disabled={busy} onClick={() => void refresh()} className="rounded-lg bg-cyan-600 px-4 py-2 disabled:opacity-50">{busy ? "Refreshing…" : "Refresh"}</button></header>
    {error && <p role="alert" className="rounded-xl bg-red-900/30 p-4">{error}</p>}
    {data && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{([["day","Today"],["week","This week"],["month","This month"],["year","This year"]] as const).map(([key,label])=>{const p=data.periods[key];return <section key={key} className={panel}><p className="text-sm text-slate-400">{label}</p><p className="my-2 text-3xl font-semibold">{money(p.cost_micros)}</p><p className="text-sm">{p.active_users} active users · {p.active_users ? money(p.cost_per_active_user_micros) : "—"} / user</p><p className="mt-2 text-xs text-amber-400">{p.unknown_attempts} unknown attempts</p></section>})}</div>
      <div className="grid gap-5 xl:grid-cols-2">
        {table("Cost by feature · this month",["Feature","Cost","Attempts","Fallbacks","Unknown"],data.features.map(r=>[String(r.name),money(r.cost_micros),r.attempts,r.fallbacks ?? 0,r.unknown_attempts]))}
        {table("Cost by provider / model · this month",["Provider","Model","Cost","Attempts","Unknown"],data.provider_models.map(r=>[r.provider ?? "—",r.model ?? "—",money(r.cost_micros),r.attempts,r.unknown_attempts]))}
        {table("Cost by user · this month",["User","Cost","Attempts","Fallbacks","Unknown"],data.users.map(r=>[String(r.name),money(r.cost_micros),r.attempts,r.fallbacks ?? 0,r.unknown_attempts]))}
        {table("User cost by feature · this month",["User","Feature","Cost","Attempts","Unknown"],data.user_features.map(r=>[r.user_id,r.feature,money(r.cost_micros),r.attempts,r.unknown_attempts]))}
      </div>
      <section className={panel}><h2 className="mb-3 font-semibold">Individual AI requests</h2><p className="mb-3 text-sm text-slate-400">A request includes every provider attempt. Fallback costs are added together. Unknown means billable usage could not be determined.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Time","User","Feature","Status","Attempts","Cost","Unknown"].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{data.requests.map(r=><tr key={r.request_id}><td className="p-2">{new Date(r.created_at).toLocaleString()}</td><td className="p-2">{r.user_id}</td><td className="p-2">{r.feature}</td><td className="p-2">{r.status}</td><td className="p-2">{r.attempts}</td><td className="p-2">{r.unknown_attempts ? "Unknown" : money(r.cost_micros)}</td><td className="p-2">{r.unknown_attempts}</td></tr>)}</tbody></table></div></section>
      <section className={panel}><h2 className="mb-3 font-semibold">Recent provider attempts</h2><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{["User / feature","Provider / model","Result","Tokens","Cache","Duration","Cost"].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{data.recent.map(r=><tr key={r.id}><td className="p-2">{r.user_id} / {r.feature}</td><td className="p-2">{r.provider} / {r.model}{r.fallback ? " (fallback)" : ""}</td><td className="p-2">{r.status}</td><td className="p-2">{r.input_tokens ?? "?"} in / {r.output_tokens ?? "?"} out</td><td className="p-2">{r.cache_hit_tokens ?? "—"} hit / {r.cache_miss_tokens ?? "—"} miss {r.billing_period ? `· ${r.billing_period}` : ""}</td><td className="p-2">{r.duration_ms ?? "—"} ms</td><td className="p-2">{money(r.cost_micros)}</td></tr>)}</tbody></table></div></section>
    </>}
  </div>;
}
