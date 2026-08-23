"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acknowledgeAdminIncident,
  addAdminIncidentNote,
  getAdminIncidents,
  triggerAdminTestIncident,
  updateAdminIncident,
  type PulseIncidentItem,
} from "@/lib/api";

type Filter = "open" | "critical" | "monitoring" | "fixed" | "all";
type TimelineItem = { type?: string; author?: string; note?: string; detail?: string; created_at?: string };

const formatDate = (value?: string | null) => {
  if (!value) return "Not available";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

const timelineFor = (incident: PulseIncidentItem): TimelineItem[] => {
  const value = incident.incident_meta?.timeline;
  return Array.isArray(value) ? (value as TimelineItem[]).slice().reverse() : [];
};

export default function PulsePage() {
  const [filter, setFilter] = useState<Filter>("open");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const accessCode = useMemo(
    () => (typeof window === "undefined" ? "" : sessionStorage.getItem("xcr8-admin-access") ?? ""),
    [],
  );
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-incidents"] });

  const { data = [], isFetching } = useQuery({
    queryKey: ["admin-incidents"],
    queryFn: () => getAdminIncidents(accessCode),
    enabled: Boolean(accessCode),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const change = useMutation({
    mutationFn: ({ id, status, summary }: { id: number; status: "investigating" | "fixed"; summary?: string }) =>
      updateAdminIncident(accessCode, id, { status, resolution_summary: summary }),
    onSuccess: refresh,
  });
  const test = useMutation({ mutationFn: () => triggerAdminTestIncident(accessCode), onSuccess: refresh });
  const acknowledge = useMutation({
    mutationFn: (id: number) => acknowledgeAdminIncident(accessCode, id),
    onSuccess: refresh,
  });
  const addNote = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      addAdminIncidentNote(accessCode, id, note),
    onSuccess: (_data, variables) => {
      setNotes((current) => ({ ...current, [variables.id]: "" }));
      void refresh();
    },
  });

  const visible = data.filter((incident) => {
    if (filter === "all") return true;
    if (filter === "fixed") return incident.status === "fixed";
    if (filter === "monitoring") return incident.status === "monitoring";
    if (filter === "critical") return incident.status !== "fixed" && incident.severity === "critical";
    return incident.status !== "fixed";
  });
  const counts = {
    open: data.filter((item) => item.status !== "fixed").length,
    critical: data.filter((item) => item.status !== "fixed" && item.severity === "critical").length,
    monitoring: data.filter((item) => item.status === "monitoring").length,
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="xcr8-eyebrow">Project Pulse</p>
          <h2 className="xcr8-title-lg text-white light:text-slate-900">Incident command</h2>
          <p className="mt-1 text-sm text-slate-400">Impact, ownership, recovery evidence and user support in one place.</p>
        </div>
        <button type="button" disabled={test.isPending} onClick={() => test.mutate()} className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300 disabled:opacity-50">
          {test.isPending ? "Running test…" : "Run monitoring test"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Open", value: counts.open, tone: "text-amber-300" },
          { label: "Critical", value: counts.critical, tone: "text-rose-300" },
          { label: "Monitoring", value: counts.monitoring, tone: "text-cyan-300" },
        ].map((item) => (
          <div key={item.label} className="xcr8-panel rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
            <p className={`mt-2 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <p className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">
        Pulse redacts sensitive details, groups matching faults, sends affected users an in-app support message and requires sustained healthy traffic before automatic resolution.
      </p>

      <div className="flex flex-wrap gap-2">
        {(["open", "critical", "monitoring", "fixed", "all"] as Filter[]).map((item) => (
          <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${filter === item ? "bg-cyan-400 text-slate-950" : "border border-white/10 bg-white/5 text-slate-300"}`}>
            {item}
          </button>
        ))}
        {isFetching ? <span className="self-center text-xs text-slate-500">Refreshing…</span> : null}
      </div>

      <div className="space-y-3">
        {visible.length === 0 ? <div className="xcr8-panel rounded-2xl p-5 text-sm text-slate-400">No incidents match this view.</div> : visible.map((incident) => {
          const expanded = expandedId === incident.id;
          const timeline = timelineFor(incident);
          const owner = String(incident.incident_meta?.owner || "Unassigned");
          return (
            <article key={incident.id} className="xcr8-panel rounded-2xl p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-white light:text-slate-900">{incident.title}</p>
                    <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] uppercase text-slate-400">{incident.status === "fixed" ? "resolved" : incident.status}</span>
                    <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[10px] uppercase text-rose-300">{incident.severity}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{incident.feature} · {incident.total_events_count} events · {incident.affected_users_count} affected users · Owner: {owner}</p>
                  <p className="mt-2 text-xs text-slate-500">{incident.possible_reason}</p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  {incident.status !== "fixed" ? (
                    <>
                      <button type="button" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate(incident.id)} className="rounded-lg bg-cyan-500/15 px-3 py-2 text-xs text-cyan-300 disabled:opacity-50">Acknowledge</button>
                      <button type="button" disabled={change.isPending} onClick={() => change.mutate({ id: incident.id, status: "fixed", summary: notes[incident.id]?.trim() || undefined })} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs text-emerald-300 disabled:opacity-50">Mark resolved</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => change.mutate({ id: incident.id, status: "investigating" })} className="rounded-lg bg-amber-500/15 px-3 py-2 text-xs text-amber-300">Reopen</button>
                  )}
                  <button type="button" onClick={() => setExpandedId(expanded ? null : incident.id)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">{expanded ? "Hide details" : "View details"}</button>
                </div>
              </div>

              {expanded ? (
                <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                  <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <div><p className="text-slate-500">First detected</p><p className="mt-1 text-slate-300">{formatDate(incident.first_seen_at)}</p></div>
                    <div><p className="text-slate-500">Last detected</p><p className="mt-1 text-slate-300">{formatDate(incident.last_seen_at)}</p></div>
                    <div><p className="text-slate-500">Provider</p><p className="mt-1 text-slate-300">{incident.provider || "Xcr8"}</p></div>
                    <div><p className="text-slate-500">Resolution</p><p className="mt-1 text-slate-300">{incident.resolution_summary || "Not resolved yet"}</p></div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium text-slate-300">Incident timeline</p>
                    {timeline.length ? <div className="space-y-2">{timeline.slice(0, 12).map((item, index) => (
                      <div key={`${item.created_at || "event"}-${index}`} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                        <p className="font-medium capitalize text-slate-200">{item.type || "Update"}{item.author ? ` · ${item.author}` : ""}</p>
                        <p className="mt-1 text-slate-400">{item.note || item.detail || "Incident state updated."}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{formatDate(item.created_at)}</p>
                      </div>
                    ))}</div> : <p className="text-xs text-slate-500">No timeline updates yet.</p>}
                  </div>

                  <div className="flex gap-2">
                    <input value={notes[incident.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [incident.id]: event.target.value }))} placeholder="Add evidence, owner update or resolution note" className="xcr8-input !py-2 text-xs" />
                    <button type="button" disabled={!notes[incident.id]?.trim() || addNote.isPending} onClick={() => addNote.mutate({ id: incident.id, note: notes[incident.id].trim() })} className="rounded-lg border border-white/10 px-3 text-xs text-slate-300 disabled:opacity-50">Add note</button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
