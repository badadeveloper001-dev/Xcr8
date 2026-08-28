"use client";

import Link from "next/link";
import { ExternalLink, Sparkles } from "lucide-react";
import type { DashboardTrendExplanation } from "@/lib/api";
import { safeSourceUrl, displayDate } from "@/lib/reporting-ui";

export function DashboardTrends({ trends }: { trends: DashboardTrendExplanation[] }) {
  if (!trends.length) return null;
  return <section className="xcr8-panel rounded-2xl p-4 sm:p-5" aria-labelledby="trend-heading">
    <div className="flex items-center gap-2"><Sparkles size={18} className="text-violet-400" /><h2 id="trend-heading" className="text-lg font-semibold text-white light:text-slate-900">Content opportunities for your niche</h2></div>
    <p className="mt-2 text-sm text-slate-400">Recent search and news signals—not a claim that these topics are viral on your social accounts.</p>
    <div className="mt-4 space-y-3">
      {trends.slice(0, 3).map(trend => {
        const source = safeSourceUrl(trend.source_url);
        const prompt = [
          `Help me understand this content opportunity for my ${trend.niche} audience: ${trend.title}.`,
          `Source: ${source || trend.source_label}. Source date: ${trend.source_published_at || "not supplied"}.`,
          `Available context: ${trend.what_happened}.`,
          "Explain it in plain language, distinguish verified facts from suggestions, and propose one useful post with a hook and takeaway. Do not claim virality or source details you cannot verify.",
        ].join("\n");
        return <article key={trend.id} className="surface-soft rounded-xl p-4">
          <p className="text-[11px] font-medium text-violet-400">Selected for: {trend.niche}</p>
          <h3 className="mt-1 break-words text-base font-semibold text-white light:text-slate-900">{trend.title}</h3>
          <dl className="mt-3 space-y-3 text-sm">
            <div><dt className="font-semibold text-slate-200 light:text-slate-800">What's happening</dt><dd className="mt-1 break-words leading-relaxed text-slate-400">{trend.what_happened}</dd></div>
            <div><dt className="font-semibold text-slate-200 light:text-slate-800">Why you're seeing it</dt><dd className="mt-1 text-slate-400">{trend.why_it_matters}</dd></div>
            <div><dt className="font-semibold text-slate-200 light:text-slate-800">An idea to try</dt><dd className="mt-1 text-slate-400">{trend.suggested_action} Add your own experience and one practical takeaway.</dd></div>
          </dl>
          <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer py-2">Source and timing</summary><p>{trend.source_label}</p><p className="mt-1">Published: {displayDate(trend.source_published_at)}</p><p className="mt-1">Detected by Xcr8: {displayDate(trend.detected_at)}</p><p className="mt-2">Check the source before posting. A topic's relevance does not guarantee reach.</p></details>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link href={`/ai-studio/assistant?fresh=1&prompt=${encodeURIComponent(prompt)}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-500/15 px-3 text-sm font-medium text-violet-400"><Sparkles size={15} />Help me turn this into a post</Link>
            {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm text-slate-400">Read source<ExternalLink size={13} /></a> : <span className="text-xs text-slate-500">Source link unavailable</span>}
          </div>
        </article>;
      })}
    </div>
  </section>;
}
