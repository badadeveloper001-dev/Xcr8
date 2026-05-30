"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";

export default function AIStudioPage() {
  return (
    <StudioShell title="AI Studio" subtitle="Pick a tool and open its dedicated workspace page.">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-soft rounded-2xl p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            How this now works
          </p>
          <h2 className="text-lg font-semibold text-white light:text-slate-900">
            Each shelf tool opens as a separate page
          </h2>
          <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
            Composer, Brainstorm, Image Generator, Voiceover, and Trend Mapper are now routed to
            individual pages so each workflow has a focused workspace.
          </p>
        </div>

        <div className="surface-soft rounded-2xl p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Start now
          </p>
          <h2 className="text-lg font-semibold text-white light:text-slate-900">
            Open the new Image Generator workspace
          </h2>
          <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
            Build image concepts and copy structured prompts for your preferred generation model.
          </p>
          <Link
            href="/ai-studio/image-generator"
            className="cta-btn mt-4 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold"
          >
            Go to Image Generator
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </StudioShell>
  );
}
