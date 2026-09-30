"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ChevronDown,
  FileWarning,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const primaryItems: NavItem[] = [
  { href: "/admin/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/dashboard/creators", label: "Creators", icon: Users },
  { href: "/admin/dashboard/content", label: "Content", icon: FileWarning },
  { href: "/admin/dashboard/system", label: "System", icon: Settings2 },
];

const pulseItems: NavItem[] = [
  { href: "/admin/dashboard/pulse", label: "Incident Command", icon: Activity },
  { href: "/admin/dashboard/pulse/costs", label: "AI Cost Accounting", icon: Activity },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pulseOpen, setPulseOpen] = useState(
    pathname === "/admin/dashboard/pulse" || pathname.startsWith("/admin/dashboard/pulse/"),
  );

  const signOut = async () => {
    await fetch("/admin/data/session", { method: "DELETE" });
    sessionStorage.removeItem("xcr8-admin-access");
    router.replace("/admin");
  };

  const navigate = () => setOpen(false);

  return (
    <main className="lux-page min-h-screen px-4 py-5">
      <div className="mx-auto max-w-6xl">
        {open ? (
          <button
            type="button"
            aria-label="Close admin navigation"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[2px]"
          />
        ) : null}

        <aside
          aria-label="Admin navigation"
          className={`fixed inset-y-0 left-0 z-50 w-[280px] border-r border-white/10 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl transition-transform duration-200 light:bg-white/95 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="xcr8-eyebrow">Admin Console</p>
                <p className="font-semibold text-white light:text-slate-900">XCR8 Operations</p>
              </div>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="mt-4 flex-1 space-y-1 overflow-y-auto">
              {primaryItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={navigate}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive(pathname, href)
                      ? "bg-cyan-400 text-slate-950"
                      : "text-slate-300 hover:bg-white/5 hover:text-white light:text-slate-700 light:hover:text-slate-950"
                  }`}
                >
                  <Icon size={17} />
                  {label}
                </Link>
              ))}

              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => setPulseOpen((value) => !value)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    pathname.startsWith("/admin/dashboard/pulse")
                      ? "bg-white/10 text-white light:bg-slate-100 light:text-slate-900"
                      : "text-slate-300 hover:bg-white/5 hover:text-white light:text-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Activity size={17} />
                    Pulse
                  </span>
                  <ChevronDown size={16} className={pulseOpen ? "rotate-180 transition" : "transition"} />
                </button>

                {pulseOpen ? (
                  <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-2">
                    {pulseItems.map(({ href, label, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={navigate}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                          isActive(pathname, href)
                            ? "bg-cyan-400/15 text-cyan-300 light:bg-cyan-50 light:text-cyan-700"
                            : "text-slate-400 hover:bg-white/5 hover:text-slate-200 light:text-slate-600 light:hover:text-slate-900"
                        }`}
                      >
                        <Icon size={15} />
                        {label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            </nav>

            <div className="border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white light:text-slate-700 light:hover:text-slate-950"
              >
                <LogOut size={17} />
                Sign out
              </button>
            </div>
          </div>
        </aside>

        <header className="xcr8-panel mb-5 flex items-center justify-between gap-3 rounded-2xl p-3 sm:p-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open admin navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
              className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-200 transition hover:bg-white/10 light:text-slate-800"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p className="xcr8-eyebrow">Admin Console</p>
              <h1 className="truncate text-base font-semibold text-white light:text-slate-900 sm:text-lg">
                XCR8 Operations
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void signOut()}
              className="hidden rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 sm:block"
            >
              <LogOut size={14} className="mr-1 inline" />
              Sign out
            </button>
          </div>
        </header>

        {children}
      </div>
    </main>
  );
}
