"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Sparkles } from "lucide-react";
import { useCreatorStore } from "@/lib/store";

export function Cr8orAiWidget() {
  const hasHydrated = useCreatorStore((state) => state.hasHydrated);
  const userId = useCreatorStore((state) => state.userId);
  const pathname = usePathname();

  const hideOnboardingWidget =
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/welcome") ||
    pathname.startsWith("/auth/signup");

  if (hideOnboardingWidget) {
    return null;
  }

  const href = hasHydrated && !userId ? "/auth/login" : "/ai-studio/assistant";

  return (
    <div className="fixed bottom-24 right-4 z-40 sm:bottom-24 sm:right-6 lg:bottom-6 lg:right-8">
      <Link
        href={href}
        className="group inline-flex items-center gap-2.5 rounded-full border border-cyan-300/35 bg-gradient-to-r from-indigo-500/85 to-cyan-500/80 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(34,211,238,0.35)] backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(14,165,233,0.4)] light:border-cyan-300 light:from-indigo-500 light:to-cyan-500"
        aria-label="Open Cr8or AI chat"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/20 ring-1 ring-white/35 light:bg-white/25">
          <Bot size={16} />
        </span>
        <span className="leading-none">Cr8or AI</span>
        <Sparkles size={14} className="opacity-90 transition group-hover:scale-110" />
      </Link>
    </div>
  );
}
