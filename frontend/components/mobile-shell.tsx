import { ReactNode } from "react";
import { MobileNav } from "@/components/mobile-nav";
import { CreatorProfileSwitcher } from "@/components/creator-profile-switcher";
import { CreatorMenu } from "@/components/creator-menu";

type MobileShellProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  hideHeader?: boolean;
};

export function MobileShell({ children, title, subtitle, hideHeader = false }: MobileShellProps) {
  return (
    <div className="relative mx-auto min-h-screen w-full max-w-6xl overflow-x-clip px-4 pb-[calc(env(safe-area-inset-bottom)+8.5rem)] pt-4 supports-[height:100dvh]:min-h-[100dvh] sm:px-6 sm:pt-6 lg:px-10">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-violet-600 focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 rounded-[34px] bg-gradient-to-b from-indigo-500/24 via-cyan-500/10 to-transparent blur-2xl light:from-indigo-200/55" />
      <div className="pointer-events-none absolute -right-12 top-24 -z-10 h-52 w-52 rounded-full bg-cyan-400/16 blur-3xl light:bg-cyan-200/35" />
      <div className="pointer-events-none absolute left-[-48px] top-[38%] -z-10 h-44 w-44 rounded-full bg-rose-400/12 blur-3xl light:bg-rose-200/30" />

      <div className="mx-auto min-w-0 w-full max-w-[460px] sm:max-w-[640px] md:max-w-[820px] lg:max-w-[1120px]">
        {!hideHeader ? (
          <header
            className="mb-5 flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-2.5 py-2.5 backdrop-blur-sm light:border-slate-200 light:bg-white/80"
            aria-label="Page header"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <CreatorMenu />
              <div className="min-w-0">
                {title ? (
                  <h1 className="truncate text-base font-semibold text-white dark:text-white light:text-[#111827]">
                    {title}
                  </h1>
                ) : null}
                {subtitle ? (
                  <p className="mt-0.5 truncate text-[11px] dark:text-slate-400 light:text-slate-500">
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="shrink-0">
              <CreatorProfileSwitcher />
            </div>
          </header>
        ) : (
          <div className="mb-4 flex min-w-0 items-center justify-between gap-3" aria-label="Active profile and creator menu">
            <CreatorMenu />
            <CreatorProfileSwitcher />
          </div>
        )}

        <main id="main-content" className="relative min-w-0">
          <div className="pointer-events-none absolute inset-x-0 -top-2 -z-10 h-8 rounded-full bg-violet-500/8 blur-xl" />
          {children}
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
