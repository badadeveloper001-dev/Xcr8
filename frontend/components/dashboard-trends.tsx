"use client";

import Link from "next/link";
import { ChevronDown, ExternalLink, Sparkles } from "lucide-react";
import type { DashboardTrendExplanation } from "@/lib/api";
import { safeSourceUrl, displayDate } from "@/lib/reporting-ui";

export function DashboardTrends({ trends }: { trends: DashboardTrendExplanation[] }) {
  if (!trends.length) return null;
  return <section className="xcr8-panel rounded-2xl p-4" aria-labelledby="trend-heading">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><Sparkles size={16} className="text-violet-400" /><h2 id="trend-heading" className="text-base font-semibold text-white light:text-slate-900">Niche opportunities</h2></div>
      <Link href="/notifications?category=trends" className="text-xs font-medium text-violet-400">See all</Link>
    </div>
    <p className="mt-1 text-xs text-slate-500">Fresh signals matched to {trends[0]?.niche || "your niche"}.</p>
    <div className="mt-3 space-y-2">
      {trends.slice(0, 2).map(trend => {
        const source = safeSourceUrl(trend.source_url);
        const prompt = `Explain this current ${trend.niche} opportunity in plain language, verify what you can from ${source || trend.source_label}, and suggest one useful post: ${trend.title}.`;
        return <details key={trend.id} className="surface-soft group rounded-xl">
          <summary className="flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white light:text-slate-900">{trend.title}</span><span className="mt-1 block text-[11px] text-slate-500">Why this matches: {trend.niche}</span></span>
            <ChevronDown size={16} className="shrink-0 text-slate-500 transition group-open:rotate-180" />
          </summary>
          <div className="border-t border-white/10 px-3 pb-3 pt-3 text-xs light:border-slate-200">
            <p className="leading-relaxed text-slate-400"><strong className="text-slate-300 light:text-slate-700">What happened:</strong> {trend.what_happened}</p>
            <p className="mt-2 leading-relaxed text-slate-400"><strong className="text-slate-300 light:text-slate-700">What to do:</strong> {trend.suggested_action}</p>
            <p className="mt-2 text-slate-500">{trend.source_label} · Published {displayDate(trend.source_published_at)}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link href={`/ai-studio/assistant?fresh=1&prompt=${encodeURIComponent(prompt)}`} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-violet-500/15 px-2.5 text-violet-400"><Sparkles size={13} />Turn into a post</Link>
              {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 text-slate-400">Source <ExternalLink size={12} /></a> : null}
            </div>
          </div>
        </details>;
      })}
    </div>
  </section>;
}
