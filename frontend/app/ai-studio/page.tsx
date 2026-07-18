"use client";

import Link from "next/link";
import { Bot } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";

export default function AIStudioPage() {
  return (
    <StudioShell
      title="AI Studio"
      subtitle="Launch premium AI workflows in dedicated creator workspaces."
    >
      {/* Quick-launch strip shown above the tool shelf */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-400 light:text-violet-600">
            Xcr8 Intelligence
          </p>
          <p className="mt-1 text-sm text-slate-400 light:text-slate-600">
            Pick a tool and start building.
          </p>
        </div>
        <Link
          href="/ai-studio/assistant"
          className="cta-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          <Bot size={15} />
          Open Cr8or AI
        </Link>
      </div>
    </StudioShell>
  );
}
