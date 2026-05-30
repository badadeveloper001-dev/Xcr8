import Link from "next/link";
import { studioTools, toolStatusLabel, type StudioToolId } from "@/lib/ai-studio-tools";

type ToolShelfProps = {
  activeToolId?: StudioToolId;
};

export function ToolShelf({ activeToolId }: ToolShelfProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {studioTools.map((tool) => {
        const Icon = tool.icon;
        const isActive = activeToolId === tool.id;

        return (
          <Link
            key={tool.id}
            href={tool.href}
            className={`rounded-2xl border p-4 text-left transition ${
              isActive
                ? "border-violet-400/40 bg-violet-500/12 shadow-[0_0_0_1px_rgba(167,139,250,0.25)]"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-black/20 text-violet-300 light:bg-violet-50 light:text-violet-700">
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
          </Link>
        );
      })}
    </div>
  );
}
