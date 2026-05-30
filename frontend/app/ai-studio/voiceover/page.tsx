"use client";

import { Mic } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";

export default function VoiceoverPage() {
  return (
    <StudioShell
      title="AI Studio"
      subtitle="Voiceover now opens as its own page from the tool shelf."
      activeToolId="voiceover"
    >
      <div className="surface-soft rounded-2xl p-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300 light:border-amber-500/20 light:bg-amber-50 light:text-amber-700">
          Planned
        </div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white light:text-slate-900">
          <Mic size={17} className="text-violet-300" />
          Voiceover Script Writer
        </h2>
        <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
          This page is now wired and ready for backend integration for spoken script generation.
        </p>
      </div>
    </StudioShell>
  );
}
