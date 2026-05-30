"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { studioTools, toolStatusLabel, type StudioToolId } from "@/lib/ai-studio-tools";

type ToolShelfProps = {
  activeToolId?: StudioToolId;
};

export function ToolShelf({ activeToolId }: ToolShelfProps) {
  const router = useRouter();

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {studioTools.map((tool) => {
        const Icon = tool.icon;
        const isActive = activeToolId === tool.id;

        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => router.push(tool.href)}
            aria-label={`Open ${tool.name}`}
            className={`group rounded-2xl border p-4 text-left transition duration-200 ${
              isActive
                ? "border-indigo-300/40 bg-gradient-to-br from-indigo-500/18 via-cyan-500/12 to-pink-500/12 shadow-[0_0_0_1px_rgba(129,140,248,0.32),0_16px_34px_-24px_rgba(56,189,248,0.8)]"
                : "border-white/10 bg-white/5 hover:-translate-y-0.5 hover:border-indigo-300/30 hover:bg-white/10 light:border-slate-200 light:bg-white/70 light:hover:border-indigo-300"
            } cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60`}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div
                className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition ${
                  isActive
                    ? "border-cyan-300/45 bg-cyan-300/12 text-cyan-100 light:border-cyan-300 light:bg-cyan-100 light:text-cyan-700"
                    : "border-white/10 bg-black/20 text-indigo-200 group-hover:text-cyan-200 light:border-slate-200 light:bg-indigo-50 light:text-indigo-700 light:group-hover:text-cyan-700"
                }`}
              >
                <Icon size={18} />
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  tool.status === "live"
                    ? "bg-emerald-500/15 text-emerald-300 light:bg-emerald-100 light:text-emerald-700"
                    : tool.status === "next"
                      ? "bg-amber-500/15 text-amber-300 light:bg-amber-100 light:text-amber-700"
                      : "bg-white/10 text-slate-400 light:bg-slate-100 light:text-slate-600"
                }`}
              >
                {toolStatusLabel[tool.status]}
              </span>
            </div>

            <h2 className="text-base font-semibold text-white light:text-slate-900">{tool.name}</h2>
            <p className="mt-1 text-sm text-slate-200 light:text-slate-700">{tool.tagline}</p>
            <p className="mt-2 text-xs leading-5 text-slate-400 light:text-slate-600">
              {tool.description}
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-cyan-200 transition group-hover:text-cyan-100 light:text-cyan-700 light:group-hover:text-cyan-600">
              Open workspace
              <ArrowUpRight size={13} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
