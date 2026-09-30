"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  FileWarning,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

const primaryItems = [
  ["/admin/dashboard", "Overview", LayoutDashboard],
  ["/admin/dashboard/creators", "Creators", Users],
  ["/admin/dashboard/content", "Content", FileWarning],
  ["/admin/dashboard/system", "System", Settings2],
  ["/admin/dashboard/security", "Security", ShieldCheck],
] as const;

const pulseItems = [
  ["/admin/dashboard/pulse", "Incident Command"],
  ["/admin/dashboard/pulse/costs", "AI Cost Accounting"],
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pulseOpen, setPulseOpen] = useState(pathname.startsWith("/admin/dashboard/pulse"));

  useEffect(() => {
    setPulseOpen(pathname.startsWith("/admin/dashboard/pulse"));
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || (href !== "/admin/dashboard" && pathname.startsWith(`${href}/`));

  const signOut = async () => {
    await fetch("/admin/data/session", { method: "DELETE" });
    sessionStorage.removeItem("xcr8-admin-access");
    router.replace("/admin");
  };

  return (
    <main className="lux-page min-h-screen px-4 py-5">
      <div className="mx-auto max-w-6xl">
        <header className="xcr8-panel mb-5 flex items-center justify-between gap-3 rounded-2xl p-3 sm:p-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label={open ? "Close admin navigation" : "Open admin navigation"}
              aria-expanded={open}
              onClick={() => setOpen((current) => !current)}
              className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-200 transition hover:bg-white/10"
            >
              {open ? <X size={19} /> : <Menu size={19} />}
            </button>
            <div className="min-w-0">
              <p className="xcr8-eyebrow">Admin Console</p>
              <h1 className="truncate text-lg font-semibold text-white light:text-slate-900">XCR8 Operations</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={signOut}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300"
            >
              <LogOut size={14} className="mr-1 inline" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        {open ? (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[1px]"
          />
        ) : null}

        <aside
          aria-label="Admin navigation"
          className={`fixed inset-y-0 left-0 z-50 w-[min(86vw,320px)] border-r border-white/10 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <p className="xcr8-eyebrow">XCR8</p>
              <p className="font-semibold text-white">Admin Console</p>
            </div>
            <button
              type="button"
              aria-label="Close admin navigation"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-white/10 p-2 text-slate-300"
            >
              <X size={17} />
            </button>
          </div>

          <nav className="mt-4 space-y-1.5">
            {primaryItems.map(([href, label, Icon]) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive(href) ? "bg-cyan-400 text-slate-950 font-semibold" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
              >
                <Icon size={17} />
                {label}
              </Link>
            ))}

            <div className="pt-1">
              <button
                type="button"
                aria-expanded={pulseOpen}
                onClick={() => setPulseOpen((current) => !current)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${pathname.startsWith("/admin/dashboard/pulse") ? "bg-cyan-500/10 text-cyan-300" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
              >
                <span className="flex items-center gap-3">
                  <Activity size={17} />
                  Pulse
                </span>
                {pulseOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>

              {pulseOpen ? (
                <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
                  {pulseItems.map(([href, label]) => (
                    <Link
                      key={href}
                      href={href}
                      className={`block rounded-lg px-3 py-2 text-xs transition ${isActive(href) ? "bg-white/10 font-semibold text-cyan-300" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </nav>

          <div className="mt-6 border-t border-white/10 pt-4">
            <p className="px-3 text-[10px] uppercase tracking-[0.16em] text-slate-600">Coming sections</p>
            <p className="px-3 pt-2 text-xs leading-5 text-slate-500">
              Billing, analytics, security tools and additional admin controls will be added here as their real admin workflows are introduced.
            </p>
          </div>
        </aside>

        {children}
      </div>
    </main>
  );
}
