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
    <div className="relative mx-auto min-h-screen w-full max-w-6xl overflow-x-clip px-4 pb-32 pt-6 sm:px-6 lg:px-10">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-violet-600 focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 rounded-[34px] bg-gradient-to-b from-violet-500/20 via-violet-500/10 to-transparent blur-2xl light:from-violet-200/45" />
      <div className="pointer-events-none absolute -right-12 top-24 -z-10 h-52 w-52 rounded-full bg-fuchsia-500/15 blur-3xl light:bg-violet-200/30" />
      <div className="pointer-events-none absolute left-[-48px] top-[38%] -z-10 h-44 w-44 rounded-full bg-blue-500/10 blur-3xl light:bg-indigo-200/35" />
      <div className="mx-auto w-full max-w-[460px] lg:max-w-[1120px]">
        {!hideHeader ? (
          <header className="mb-6 flex items-start justify-between" aria-label="Page header">
            <div>
              {title ? (
                <h1 className="text-4xl font-semibold tracking-tight text-white dark:text-white light:text-[#111827]">
                  {title}
                </h1>
              ) : null}
              {subtitle ? (
                <p className="mt-2 text-sm text-slate-400 dark:text-slate-400 light:text-slate-600">
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
