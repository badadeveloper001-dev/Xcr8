"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { studioTools, type StudioToolId } from "@/lib/ai-studio-tools";

type ToolShelfProps = {
  activeToolId?: StudioToolId;
};

export function ToolShelf({ activeToolId }: ToolShelfProps) {
  const router = useRouter();

  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {studioTools.map((tool) => {
        const Icon = tool.icon;
        const isActive = activeToolId === tool.id;

        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => router.push(tool.href)}
            aria-label={`Open ${tool.name}`}
            className={`group rounded-2xl border p-3 text-left transition duration-200 ${
              isActive
                ? "border-indigo-300/40 bg-gradient-to-br from-indigo-500/18 via-cyan-500/12 to-pink-500/12 shadow-[0_0_0_1px_rgba(129,140,248,0.32),0_16px_34px_-24px_rgba(56,189,248,0.8)]"
                : "border-white/10 bg-white/5 hover:-translate-y-0.5 hover:border-indigo-300/30 hover:bg-white/10 light:border-slate-200 light:bg-white/70 light:hover:border-indigo-300"
            } cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60`}
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                  isActive
                    ? "border-cyan-300/45 bg-cyan-300/12 text-cyan-100 light:border-cyan-300 light:bg-cyan-100 light:text-cyan-700"
                    : "border-white/10 bg-black/20 text-indigo-200 group-hover:text-cyan-200 light:border-slate-200 light:bg-indigo-50 light:text-indigo-700 light:group-hover:text-cyan-700"
                }`}
              >
                <Icon size={18} />
              </div>
              <ArrowUpRight size={14} className="text-slate-400 transition group-hover:text-cyan-300 light:text-slate-500 light:group-hover:text-cyan-700" />
            </div>

            <h2 className="mt-2 text-sm font-semibold text-white light:text-slate-900">{tool.name}</h2>
          </button>
        );
      })}
    </div>
  );
}
