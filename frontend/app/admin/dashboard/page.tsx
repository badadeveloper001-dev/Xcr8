"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, LogOut, Radar, Users } from "lucide-react";
import { getAdminOverview, getApiErrorMessage } from "@/lib/api";

const ADMIN_SESSION_KEY = "xcr8-admin-access";

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
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

export default function AdminDashboardPage() {
  const router = useRouter();

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
        </section>

        {error ? (
          <section className="xcr8-panel rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            {getApiErrorMessage(error, "Could not load admin analytics.")}
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total users" value={data?.total_users ?? 0} icon={Users} />
          <StatCard label="Onboarded users" value={data?.onboarded_users ?? 0} icon={Users} />
          <StatCard label="Active users (7d)" value={data?.active_users_7d ?? 0} icon={Radar} />
          <StatCard label="AI generations" value={data?.ai_generations ?? 0} icon={BarChart3} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="xcr8-panel rounded-2xl p-4">
            <h2 className="xcr8-title-lg mb-3 text-white light:text-slate-900">Content Health</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="surface-soft rounded-xl px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total Posts</p>
                <p className="mt-1 text-lg font-semibold text-white light:text-slate-900">
                  {data?.total_posts ?? 0}
                </p>
              </div>
              <div className="surface-soft rounded-xl px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Drafts</p>
                <p className="mt-1 text-lg font-semibold text-white light:text-slate-900">
                  {data?.draft_posts ?? 0}
                </p>
              </div>
              <div className="surface-soft rounded-xl px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Scheduled</p>
                <p className="mt-1 text-lg font-semibold text-white light:text-slate-900">
                  {data?.scheduled_posts ?? 0}
                </p>
              </div>
              <div className="surface-soft rounded-xl px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Published</p>
                <p className="mt-1 text-lg font-semibold text-white light:text-slate-900">
                  {data?.published_posts ?? 0}
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
      </div>
    </main>
  );
}
