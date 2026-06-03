"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MobileShell } from "@/components/mobile-shell";
import { useCreatorStore } from "@/lib/store";
import { ToolShelf } from "@/components/ai-studio/tool-shelf";
import type { StudioToolId } from "@/lib/ai-studio-tools";

type StudioShellProps = {
  title: string;
  subtitle: string;
  activeToolId?: StudioToolId;
  showToolShelf?: boolean;
  children: ReactNode;
};

export function StudioShell({
  title,
  subtitle,
  activeToolId,
  showToolShelf = true,
  children,
}: StudioShellProps) {
  const router = useRouter();
  const hasHydrated = useCreatorStore((state) => state.hasHydrated);
  const userId = useCreatorStore((state) => state.userId);

  useEffect(() => {
    if (hasHydrated && !userId) router.replace("/auth/login");
  }, [hasHydrated, router, userId]);

  if (!hasHydrated || !userId) return null;

  return (
    <MobileShell title={title} subtitle={subtitle}>
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="xcr8-panel cyber-grid scanline rounded-2xl border-2 border-cyan-300/25 p-4"
      >
        {showToolShelf ? (
          <>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tools
            </div>

            <div className="mb-4">
              <ToolShelf activeToolId={activeToolId} />
            </div>
          </>
        ) : (
          <div className="mb-4">
            <Link
              href="/ai-studio"
              className="inline-flex items-center rounded-full border border-indigo-300/20 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-200 transition hover:bg-indigo-500/15 light:border-indigo-300 light:bg-indigo-100 light:text-indigo-700"
            >
              Back to AI tool shelf
            </Link>
          </div>
        )}

        {children}
      </motion.section>
    </MobileShell>
  );
}
