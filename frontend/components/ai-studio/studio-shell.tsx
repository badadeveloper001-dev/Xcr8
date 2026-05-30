"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
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
  const userId = useCreatorStore((state) => state.userId);

  useEffect(() => {
    if (!userId) router.replace("/auth/login");
  }, [router, userId]);

  if (!userId) return null;

  return (
    <MobileShell title={title} subtitle={subtitle}>
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="surface-luxe cyber-grid scanline rounded-2xl p-4"
      >
        {showToolShelf ? (
          <>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
              <Sparkles size={12} />
              Creative AI tool shelf
            </div>

            <div className="mb-4">
              <ToolShelf activeToolId={activeToolId} />
            </div>
          </>
        ) : (
          <div className="mb-4">
            <Link
              href="/ai-studio"
              className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10"
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
