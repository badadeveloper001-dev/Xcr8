"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  CalendarDays,
  FileUp,
  HelpCircle,
  Menu,
  Plus,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

const menuSections = [
  {
    label: "Workspace",
    items: [
      ["/analytics", "Analytics", BarChart3],
      ["/calendar", "Calendar", CalendarDays],
      ["/upload", "Uploads", FileUp],
    ],
  },
  {
    label: "Growth",
    items: [
      ["/notifications", "Notifications", Bell],
    ],
  },
  {
    label: "Account",
    items: [
      ["/settings", "Settings", Settings],
    ],
  },
] as const;

export function CreatorMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close creator navigation" : "Open creator navigation"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white light:border-slate-200 light:bg-slate-50 light:text-slate-700 light:hover:bg-slate-100"
      >
        {open ? <X size={19} /> : <Menu size={19} />}
      </button>

      {open ? (
        <button
          type="button"
          aria-label="Close creator navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[1px]"
        />
      ) : null}

      <aside
        aria-label="Creator navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(88vw,340px)] flex-col border-r border-white/10 bg-[#08101f]/98 shadow-2xl backdrop-blur-xl transition-transform duration-200 light:border-slate-200 light:bg-white/98 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5 light:border-slate-200">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300 light:text-indigo-600">
              XCR8
            </p>
            <p className="mt-0.5 text-base font-semibold text-white light:text-slate-900">
              Creator Workspace
            </p>
          </div>
          <button
            type="button"
            aria-label="Close creator navigation"
            onClick={() => setOpen(false)}
            className="rounded-xl border border-white/10 p-2 text-slate-300 light:border-slate-200 light:text-slate-600"
          >
            <X size={17} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5">
          <div className="mb-6">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Quick actions
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Link
                href="/compose"
                className="flex items-center gap-2 rounded-2xl border border-indigo-400/20 bg-indigo-500/10 px-3 py-3 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/15 light:border-indigo-200 light:bg-indigo-50 light:text-indigo-700"
              >
                <Plus size={16} />
                Create
              </Link>
              <Link
                href="/ai-studio"
                className="flex items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/15 light:border-cyan-200 light:bg-cyan-50 light:text-cyan-700"
              >
                <Sparkles size={16} />
                AI Studio
              </Link>
            </div>
          </div>

          {menuSections.map((section) => (
            <section key={section.label} className="mb-6">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {section.label}
              </p>
              <div className="mt-2 space-y-1">
                {section.items.map(([href, label, Icon]) => (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${
                      isActive(href)
                        ? "bg-gradient-to-r from-indigo-500/20 to-cyan-500/15 font-semibold text-cyan-200 light:from-indigo-100 light:to-cyan-100 light:text-indigo-700"
                        : "text-slate-300 hover:bg-white/5 hover:text-white light:text-slate-600 light:hover:bg-slate-100 light:hover:text-slate-900"
                    }`}
                  >
                    <Icon size={17} />
                    {label}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </nav>

        <div className="border-t border-white/10 px-4 py-4 light:border-slate-200">
          <div className="flex items-center justify-between rounded-xl px-2 py-2">
            <div className="flex items-center gap-3">
              <HelpCircle size={17} className="text-slate-400" />
              <span className="text-sm text-slate-300 light:text-slate-600">Help & Feedback</span>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </aside>
    </>
  );
}
