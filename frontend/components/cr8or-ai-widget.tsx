"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Sparkles } from "lucide-react";
import { useCreatorStore } from "@/lib/store";

export function Cr8orAiWidget() {
  const hasHydrated = useCreatorStore((state) => state.hasHydrated);
  const userId = useCreatorStore((state) => state.userId);
  const pathname = usePathname();
  const isAdminHost =
    typeof window !== "undefined" &&
    (window.location.hostname.startsWith("admin.") ||
      window.location.hostname.startsWith("admin-"));

  if (!hasHydrated || !userId) {
    return null;
  }

  const visibleRoutes = [
    "/dashboard",
    "/compose",
    "/calendar",
    "/analytics",
    "/settings",
    "/upload",
    "/notifications",
  ];

  const isVisibleRoute = visibleRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  const hideOnboardingWidget =
    isAdminHost ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/welcome") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/ai-studio") ||
    pathname.startsWith("/assistant") ||
    !isVisibleRoute;

  if (hideOnboardingWidget) {
    return null;
  }

  return (
    <div className="fixed bottom-[6.4rem] right-4 z-40 sm:bottom-[6.4rem] sm:right-6 lg:bottom-6 lg:right-8">
      <Link
        href="/ai-studio/assistant"
        className="group relative flex h-12 w-12 items-center justify-center rounded-full border border-violet-300/40 bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-[0_12px_34px_rgba(139,92,246,0.38)] ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(139,92,246,0.48)] light:border-violet-300 light:from-indigo-500 light:to-violet-500"
        aria-label="Open Cr8or Intelligence"
        title="Cr8or Intelligence"
      >
        <span className="absolute inset-[-5px] rounded-full bg-violet-400/15 blur-md transition group-hover:bg-violet-400/25" />
        <span className="relative">
          <Sparkles size={20} strokeWidth={2.2} />
        </span>
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-violet-200/70 bg-[#0a1022] text-[8px] text-cyan-200">
          <Bot size={9} />
        </span>
      </Link>
    </div>
  );
}
