import { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileNav } from "@/components/mobile-nav";

type MobileShellProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  hideHeader?: boolean;
};

export function MobileShell({ children, title, subtitle, hideHeader = false }: MobileShellProps) {
  return (
    <div className="relative mx-auto min-h-screen w-full max-w-6xl overflow-x-clip px-4 pb-[calc(env(safe-area-inset-bottom)+8.5rem)] pt-6 supports-[height:100dvh]:min-h-[100dvh] sm:px-6 lg:px-10">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-violet-600 focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 rounded-[34px] bg-gradient-to-b from-indigo-500/24 via-cyan-500/10 to-transparent blur-2xl light:from-indigo-200/55" />
      <div className="pointer-events-none absolute -right-12 top-24 -z-10 h-52 w-52 rounded-full bg-cyan-400/16 blur-3xl light:bg-cyan-200/35" />
      <div className="pointer-events-none absolute left-[-48px] top-[38%] -z-10 h-44 w-44 rounded-full bg-rose-400/12 blur-3xl light:bg-rose-200/30" />
      <div className="mx-auto w-full max-w-[460px] lg:max-w-[1120px]">
        {!hideHeader ? (
          <header
            className="mb-6 flex items-start justify-between rounded-2xl border border-white/10 bg-black/10 p-3 backdrop-blur-sm light:border-slate-200 light:bg-white/70"
            aria-label="Page header"
          >
            <div className="pr-3">
              {title ? (
                <h1 className="text-3xl font-semibold tracking-tight text-white dark:text-white light:text-[#111827] sm:text-4xl">
                  {title}
                </h1>
              ) : null}
              {subtitle ? (
                <p className="mt-1.5 text-sm text-slate-300 dark:text-slate-300 light:text-slate-600">
                  {subtitle}
                </p>
              ) : null}
            </div>
            <ThemeToggle />
          </header>
        ) : null}
        <main id="main-content" className="relative">
          <div className="pointer-events-none absolute inset-x-0 -top-2 -z-10 h-8 rounded-full bg-violet-500/8 blur-xl" />
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
