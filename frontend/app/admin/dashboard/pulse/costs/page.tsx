"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Period = {
  cost_micros: number;
  active_users: number;
  cost_per_active_user_micros: number | null;
  unknown_attempts: number;
  unsettled_micros: number;
};
type Feature = {
  name: string;
  cost_micros: number;
  attempts: number;
  requests: number;
  known_requests: number;
  fallbacks: number;
  unknown_attempts: number;
  average_cost_per_request_micros: number | null;
  openai_cost_micros: number;
  deepseek_cost_micros: number;
};
type Provider = {
  provider: string;
  model: string;
  cost_micros: number;
  attempts: number;
  requests: number;
  unknown_attempts: number;
  fallbacks: number;
};
type User = {
  user_id: number;
  cost_micros: number;
  requests: number;
  attempts: number;
  known_requests: number;
  unknown_attempts: number;
  average_cost_per_request_micros: number | null;
};
type UserFeature = {
  user_id: number;
  feature: string;
  cost_micros: number;
  requests: number;
  unknown_attempts: number;
};
type RequestRow = {
  id: string;
  user_id: number;
  feature: string;
  status: string;
  duration_ms: number | null;
  attempts: number;
  unknown_attempts: number;
  fallback: boolean;
  cost_micros: number | null;
  providers: {
    provider: string;
    model: string;
    cost_micros: number | null;
    fallback: boolean;
    status: string;
  }[];
};
type Snapshot = {
  periods: Record<"day" | "week" | "month" | "year", Period>;
  features: Feature[];
  providers: Provider[];
  users: User[];
  user_features: UserFeature[];
  value_events: { feature: string; event: string; source: string; count: number }[];
  recent: RequestRow[];
};

const money = (value: number | null) =>
  value === null ? "Unknown" : "$" + (value / 1_000_000).toFixed(4);
const accountedMoney = (value: number | null, unknown: number) =>
  unknown > 0 ? "Unknown" : money(value);
const panel = "rounded-2xl border border-white/10 bg-white/5 p-5";
const cell = "px-3 py-3";
const tabs = ["overview", "users", "requests"] as const;

export default function PulseCostsPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]>("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/admin/data/pulse-costs", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof body.detail === "string"
            ? body.detail
            : "Unable to load AI cost accounting.",
        );
      }
      setData(body);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load AI cost accounting.",
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="space-y-5 text-slate-100 light:text-slate-900">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/dashboard/pulse" className="text-sm text-cyan-400">
            ← Pulse
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">AI Cost Accounting</h1>
          <p className="mt-1 text-sm text-slate-400">
            What Xcr8 spends on AI, by period, feature, provider, user and request.
          </p>
        </div>
        <button
          disabled={busy}
          onClick={() => void refresh()}
          className="rounded-lg bg-cyan-600 px-4 py-2 disabled:opacity-50"
        >
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && (
        <p role="alert" className="rounded-xl bg-red-900/30 p-4">
          {error}
        </p>
      )}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["day", "Today"],
                ["week", "This week"],
                ["month", "This month"],
                ["year", "This year"],
              ] as const
            ).map(([key, label]) => {
              const period = data.periods[key];
              return (
                <section key={key} className={panel}>
                  <p className="text-sm text-slate-400">{label}</p>
                  <p className="mt-2 text-3xl font-semibold">
                    {accountedMoney(period.cost_micros, period.unknown_attempts)}
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    {period.active_users} active users
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {period.unknown_attempts > 0
                      ? "Known spend: " + money(period.cost_micros) + " · "
                      : ""}
                    {period.unknown_attempts} unknown ·{" "}
                    {money(period.unsettled_micros)} unresolved
                  </p>
                </section>
              );
            })}
          </div>

          <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            {tabs.map((item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={
                  "rounded-lg px-4 py-2 text-sm capitalize " +
                  (tab === item ? "bg-cyan-600 text-white" : "text-slate-400")
                }
              >
                {item}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="space-y-5">
              <section className={panel}>
                <div className="mb-4">
                  <h2 className="font-semibold">Cost by feature · this month</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Request averages use only requests whose provider costs are fully known.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="text-slate-400">
                      <tr>
                        {["Feature", "Total", "Requests", "Avg / request", "OpenAI", "DeepSeek", "Fallbacks"].map((x) => (
                          <th key={x} className={cell}>{x}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.features.map((row) => (
                        <tr key={row.name} className="border-t border-white/5">
                          <td className={cell + " font-medium"}>{row.name}</td>
                          <td className={cell}>
                            <span>{accountedMoney(row.cost_micros, row.unknown_attempts)}</span>
                            {row.unknown_attempts > 0 && (
                              <span className="ml-2 text-xs text-slate-500">known {money(row.cost_micros)}</span>
                            )}
                          </td>
                          <td className={cell}>{row.requests}</td>
                          <td className={cell}>{money(row.average_cost_per_request_micros)}</td>
                          <td className={cell}>{money(row.openai_cost_micros)}</td>
                          <td className={cell}>{money(row.deepseek_cost_micros)}</td>
                          <td className={cell}>{row.fallbacks ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!data.features.length && <p className="text-sm text-slate-400">No AI usage recorded yet.</p>}
                </div>
              </section>

              <section className={panel}>
                <div className="mb-4">
                  <h2 className="font-semibold">Provider & model spend · this month</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Shows exactly where the recorded AI spend went.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead className="text-slate-400">
                      <tr>
                        {["Provider", "Model", "Cost", "Requests", "Attempts", "Fallbacks"].map((x) => (
                          <th key={x} className={cell}>{x}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.providers.map((row) => (
                        <tr key={row.provider + "/" + row.model} className="border-t border-white/5">
                          <td className={cell}>{row.provider}</td>
                          <td className={cell}>{row.model}</td>
                          <td className={cell}>{accountedMoney(row.cost_micros, row.unknown_attempts)}</td>
                          <td className={cell}>{row.requests}</td>
                          <td className={cell}>{row.attempts}</td>
                          <td className={cell}>{row.fallbacks ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className={panel}>
                <h2 className="font-semibold">Product value · this month</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Value events stay secondary to financial accounting.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.value_events.map((value) => (
                    <div
                      key={value.feature + ":" + value.event + ":" + value.source}
                      className="rounded-lg border border-white/10 p-3"
                    >
                      <strong>{value.count} {value.event}</strong>
                      <p className="text-sm">{value.feature}</p>
                      <small className="text-slate-500">{value.source}</small>
                    </div>
                  ))}
                </div>
                {!data.value_events.length && (
                  <p className="mt-3 text-sm text-slate-400">No value events recorded yet.</p>
                )}
              </section>
            </div>
          )}

          {tab === "users" && (
            <div className="space-y-5">
              <section className={panel}>
                <div className="mb-4">
                  <h2 className="font-semibold">Cost by user · this month</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    User IDs are shown because the accounting ledger stores the internal user ID.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead className="text-slate-400">
                      <tr>
                        {["User ID", "Total cost", "Requests", "Avg / request", "Unknown"].map((x) => (
                          <th key={x} className={cell}>{x}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.users.map((row) => (
                        <tr key={row.user_id} className="border-t border-white/5">
                          <td className={cell}>{row.user_id}</td>
                          <td className={cell}>{money(row.cost_micros)}</td>
                          <td className={cell}>{row.requests}</td>
                          <td className={cell}>{money(row.average_cost_per_request_micros)}</td>
                          <td className={cell}>{row.unknown_attempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className={panel}>
                <h2 className="mb-4 font-semibold">User cost by feature · this month</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead className="text-slate-400">
                      <tr>
                        {["User ID", "Feature", "Cost", "Requests", "Unknown"].map((x) => (
                          <th key={x} className={cell}>{x}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.user_features.map((row) => (
                        <tr key={row.user_id + ":" + row.feature} className="border-t border-white/5">
                          <td className={cell}>{row.user_id}</td>
                          <td className={cell}>{row.feature}</td>
                          <td className={cell}>{accountedMoney(row.cost_micros, row.unknown_attempts)}</td>
                          <td className={cell}>{row.requests}</td>
                          <td className={cell}>{row.unknown_attempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {tab === "requests" && (
            <section className={panel}>
              <div className="mb-4">
                <h2 className="font-semibold">Recent AI requests</h2>
                <p className="mt-1 text-sm text-slate-400">
                  A request with fallback includes every provider attempt. Its total is the sum of all known attempt costs.
                </p>
              </div>
              <div className="space-y-3">
                {data.recent.map((row) => (
                  <details key={row.id} className="rounded-xl border border-white/10 bg-black/10">
                    <summary className="cursor-pointer list-none p-4">
                      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
                        <div>
                          <p className="font-medium">{row.feature} · user {row.user_id}</p>
                          <p className="text-xs text-slate-500">{row.id}</p>
                        </div>
                        <span className="text-sm">{row.status}</span>
                        <span className="text-sm">{row.fallback ? "Fallback used" : row.attempts + " attempt" + (row.attempts === 1 ? "" : "s")}</span>
                        <span className="font-semibold">{money(row.cost_micros)}</span>
                      </div>
                    </summary>
                    <div className="border-t border-white/10 p-4">
                      {row.unknown_attempts > 0 && (
                        <p className="mb-3 text-sm text-amber-400">
                          {row.unknown_attempts} attempt cost is unknown, so the request total is not presented as a complete dollar amount.
                        </p>
                      )}
                      <div className="space-y-2">
                        {row.providers.map((attempt, index) => (
                          <div key={attempt.provider + "/" + attempt.model + "/" + index} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 p-3 text-sm">
                            <span>
                              {attempt.provider} / {attempt.model}
                              {attempt.fallback ? " · fallback" : ""}
                            </span>
                            <span>{attempt.status}</span>
                            <span>{money(attempt.cost_micros)}</span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-slate-500">
                        Duration: {row.duration_ms ?? "—"} ms
                      </p>
                    </div>
                  </details>
                ))}
                {!data.recent.length && (
                  <p className="text-sm text-slate-400">No AI requests recorded yet.</p>
                )}
              </div>
            </section>
          )}

          <p className="text-xs text-slate-500">
            Amounts are USD microdollar calculations from the stored provider price snapshot. Unknown provider usage is never silently counted as $0.
          </p>
        </>
      )}
    </div>
  );
}
