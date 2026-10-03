"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  FileUp,
  Layers3,
  Menu,
  Settings,
  X,
  Bell,
} from "lucide-react";
import { useEffect, useState } from "react";

const menuSections = [
  {
    label: "Main",
    items: [
      ["/analytics", "Analytics", BarChart3],
      ["/calendar", "Calendar", CalendarDays],
    ],
  },
  {
    label: "Content",
    items: [
      ["/upload", "Uploads", FileUp],
      ["/notifications", "Notifications", Bell],
    ],
  },
  {
    label: "Account",
    items: [
      ["/settings/profiles", "Creator Profiles", Layers3],
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
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white light:border-slate-200 light:bg-slate-50 light:text-slate-700 light:hover:bg-slate-100"
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
        className={`fixed inset-y-0 left-0 z-50 w-[min(86vw,320px)] border-r border-white/10 bg-[#08101f]/96 p-4 shadow-2xl backdrop-blur-xl transition-transform duration-200 light:bg-white/98 light:border-slate-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4 light:border-slate-200">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300 light:text-indigo-600">
              XCR8
            </p>
            <p className="font-semibold text-white light:text-slate-900">Creator Command Center</p>
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

        <nav className="mt-5 space-y-5">
          {menuSections.map((section) => (
            <section key={section.label}>
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600 light:text-slate-400">
                {section.label}
              </p>
              <div className="mt-2 space-y-1.5">
                {section.items.map(([href, label, Icon]) => (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
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

        <div className="mt-8 border-t border-white/10 pt-4 light:border-slate-200">
          <p className="px-3 text-xs leading-5 text-slate-500">
            Everything else stays here so the bottom navigation can remain focused on your core creator actions.
          </p>
        </div>
      </aside>
    </>
  );
}
