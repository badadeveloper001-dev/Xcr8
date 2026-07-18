"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, LogOut, Radar, ShieldAlert, Users } from "lucide-react";
import {
  getAdminIncidents,
  getAdminOverview,
  getApiErrorMessage,
  triggerAdminTestIncident,
  updateAdminIncident,
} from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";

const ADMIN_SESSION_KEY = "xcr8-admin-access";

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: typeof Users;
}) {
  return (
    <article className="surface-soft rounded-xl px-4 py-3">
      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300 light:bg-cyan-100 light:text-cyan-700">
        <Icon size={16} />
      </div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white light:text-slate-900">{value}</p>
    </article>
  );
}

function MiniBarChart({
  title,
  points,
  colorClass,
}: {
  title: string;
  points: Array<{ date: string; value: number }>;
  colorClass: string;
}) {
  const maxValue = Math.max(...points.map((point) => point.value), 1);

  return (
    <article className="xcr8-panel rounded-2xl p-4">
      <h3 className="mb-3 text-sm font-semibold text-white light:text-slate-900">{title}</h3>
      <div className="flex h-32 items-end gap-2 rounded-xl border border-white/10 bg-white/5 p-3 light:border-slate-200 light:bg-slate-50">
        {points.map((point) => {
          const heightPercent = Math.max(8, Math.round((point.value / maxValue) * 100));
          const label = point.date.slice(5);
          return (
            <div key={`${title}-${point.date}`} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-slate-400">{point.value}</span>
              <div
                className={`w-full rounded-md ${colorClass}`}
                style={{ height: `${heightPercent}%` }}
                title={`${point.date}: ${point.value}`}
              />
              <span className="text-[10px] text-slate-500">{label}</span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const accessCode = useMemo(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem(ADMIN_SESSION_KEY) ?? "";
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!sessionStorage.getItem(ADMIN_SESSION_KEY)) {
      router.replace("/admin");
    }
  }, [router]);

  const { data, error, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => getAdminOverview(accessCode),
    enabled: Boolean(accessCode),
    refetchInterval: 25000,
  });

  const { data: incidents = [], isLoading: incidentsLoading } = useQuery({
    queryKey: ["admin-incidents"],
    queryFn: () => getAdminIncidents(accessCode),
    enabled: Boolean(accessCode),
    refetchInterval: 15000,
  });
  const openIncidents = incidents.filter((incident) => incident.status !== "fixed");

  const statValue = (value: number | undefined) => (isLoading ? "..." : (value ?? 0));

  const incidentMutation = useMutation({
    mutationFn: ({
      incidentId,
      status,
    }: {
      incidentId: number;
      status: "investigating" | "fixed";
    }) => updateAdminIncident(accessCode, incidentId, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-incidents"] });
    },
  });

  const triggerTestIncidentMutation = useMutation({
    mutationFn: () => triggerAdminTestIncident(accessCode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-incidents"] });
    },
  });

  return (
    <main className="lux-page min-h-screen px-5 py-8">
      <div className="lux-orb-a" />
      <div className="lux-orb-b" />
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="xcr8-panel rounded-2xl border border-cyan-300/30 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="xcr8-eyebrow">Admin Console</p>
              <h1 className="xcr8-title-lg text-white light:text-slate-900">
                XCR8 Platform Overview
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem(ADMIN_SESSION_KEY);
                  router.replace("/admin");
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700"
              >
                <span className="inline-flex items-center gap-2">
                  <LogOut size={14} />
                  Sign out
                </span>
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <section className="xcr8-panel rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            {getApiErrorMessage(error, "Could not load admin analytics.")}
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total users" value={statValue(data?.total_users)} icon={Users} />
          <StatCard label="Onboarded users" value={statValue(data?.onboarded_users)} icon={Users} />
          <StatCard
            label="Active users (7d)"
            value={statValue(data?.active_users_7d)}
            icon={Radar}
          />
          <StatCard
            label="AI generations"
            value={statValue(data?.ai_generations)}
            icon={BarChart3}
          />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Open incidents"
            value={statValue(data?.pulse_open_incidents)}
            icon={ShieldAlert}
          />
          <StatCard
            label="Critical incidents"
            value={statValue(data?.pulse_critical_incidents)}
            icon={AlertTriangle}
          />
          <StatCard label="Trend signals" value={statValue(data?.trend_signals)} icon={Radar} />
          <StatCard
            label="Published posts"
            value={statValue(data?.published_posts)}
            icon={BarChart3}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="xcr8-panel rounded-2xl p-4">
            <h2 className="xcr8-title-lg mb-3 text-white light:text-slate-900">Content Health</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="surface-soft rounded-xl px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total Posts</p>
                <p className="mt-1 text-lg font-semibold text-white light:text-slate-900">
                  {statValue(data?.total_posts)}
                </p>
              </div>
              <div className="surface-soft rounded-xl px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Drafts</p>
                <p className="mt-1 text-lg font-semibold text-white light:text-slate-900">
                  {statValue(data?.draft_posts)}
                </p>
              </div>
              <div className="surface-soft rounded-xl px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Scheduled</p>
                <p className="mt-1 text-lg font-semibold text-white light:text-slate-900">
                  {statValue(data?.scheduled_posts)}
                </p>
              </div>
              <div className="surface-soft rounded-xl px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Published</p>
                <p className="mt-1 text-lg font-semibold text-white light:text-slate-900">
                  {statValue(data?.published_posts)}
                </p>
              </div>
            </div>
          </article>

          <article className="xcr8-panel rounded-2xl p-4">
            <h2 className="xcr8-title-lg mb-3 text-white light:text-slate-900">Top Creators</h2>
            <div className="space-y-2">
              {(data?.top_creators ?? []).map((creator) => (
                <div key={creator.user_id} className="surface-soft rounded-xl px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white light:text-slate-900">
                        {creator.display_name}
                      </p>
                      <p className="text-xs text-slate-500">{creator.email}</p>
                    </div>
                    <p className="text-xs font-medium text-cyan-300">{creator.posts} posts</p>
                  </div>
                </div>
              ))}
              {isLoading ? <p className="text-sm text-slate-400">Loading analytics...</p> : null}
              {!isLoading && (data?.top_creators?.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-400">No creator activity yet.</p>
              ) : null}
            </div>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <MiniBarChart
            title="New Users (7d)"
            points={data?.users_created_7d ?? []}
            colorClass="bg-cyan-500/70"
          />
          <MiniBarChart
            title="Posts Created (7d)"
            points={data?.posts_created_7d ?? []}
            colorClass="bg-violet-500/70"
          />
          <MiniBarChart
            title="AI Generations (7d)"
            points={data?.ai_generations_7d ?? []}
            colorClass="bg-emerald-500/70"
          />
        </section>

        <section className="xcr8-panel rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="xcr8-title-lg text-white light:text-slate-900">Pulse Incidents</h2>
              <p className="text-sm text-slate-400">
                Real-time platform issues detected from the main app backend.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => triggerTestIncidentMutation.mutate()}
                disabled={triggerTestIncidentMutation.isPending}
                className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 transition hover:bg-cyan-500/15 disabled:opacity-60"
              >
                {triggerTestIncidentMutation.isPending ? "Triggering..." : "Trigger test incident"}
              </button>
              {incidentsLoading ? <p className="text-sm text-slate-400">Refreshing...</p> : null}
            </div>
          </div>

          {error ? (
            <p className="mb-3 text-sm text-rose-300">
              Admin data failed to load from the live API. Retry after sign-in or refresh.
            </p>
          ) : null}

          <div className="space-y-3">
            {openIncidents.map((incident) => (
              <article key={incident.id} className="surface-soft rounded-xl px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-white light:text-slate-900">
                        {incident.title}
                      </p>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                        {incident.feature}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                        {incident.severity}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                        {incident.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{incident.possible_reason}</p>
                    <p className="text-xs text-slate-500">
                      {incident.affected_users_count} users affected • {incident.total_events_count}{" "}
                      events • last seen {new Date(incident.last_seen_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {incident.status !== "investigating" ? (
                      <button
                        type="button"
                        onClick={() =>
                          incidentMutation.mutate({
                            incidentId: incident.id,
                            status: "investigating",
                          })
                        }
                        className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-500/15"
                      >
                        Mark investigating
                      </button>
                    ) : null}
                    {incident.status !== "fixed" ? (
                      <button
                        type="button"
                        onClick={() =>
                          incidentMutation.mutate({ incidentId: incident.id, status: "fixed" })
                        }
                        className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/15"
                      >
                        Mark fixed
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}

            {!incidentsLoading && openIncidents.length === 0 ? (
              <p className="text-sm text-slate-400">
                No incidents detected yet. Pulse is watching the platform.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
