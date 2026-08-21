"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";

const seed =
  "Cr8or AI now handles composition. Share your idea, platform, audience, tone, and goal, and I’ll turn it into a ready-to-edit post with a hook, body, CTA, and hashtags.";

export default function ComposerPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(
      `/ai-studio/assistant?fresh=1&assistant_seed=${encodeURIComponent(seed)}&prompt=${encodeURIComponent("Help me compose a social post.")}`,
    );
  }, [router]);

  return (
    <main className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="ai-stage max-w-md p-6 text-center">
        <Bot className="mx-auto mb-3 text-cyan-300" size={28} />
        <h1 className="xcr8-title-lg text-white light:text-slate-900">Opening Cr8or AI</h1>
        <p className="mt-2 text-sm text-slate-300 light:text-slate-600">
          Post composition now lives inside your unified Cr8or AI workspace.
        </p>
      </div>
    </main>
  );
}
