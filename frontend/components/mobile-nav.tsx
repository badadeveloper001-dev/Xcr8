"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Palette, Plus, User2 } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/compose", label: "Create", icon: Plus, primary: true },
  { href: "/ai-studio", label: "AI Studio", icon: Palette },
  { href: "/settings", label: "Profile", icon: User2 },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Creator quick navigation"
      className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(94%,460px)] -translate-x-1/2 rounded-[26px] border border-indigo-300/20 bg-[#0a1022]/94 px-2 py-2 shadow-[0_18px_50px_rgba(2,8,23,0.38)] backdrop-blur-2xl light:border-slate-200 light:bg-white/96 light:shadow-[0_14px_32px_rgba(17,24,39,0.12)] sm:w-[min(92%,560px)]"
    >
      <ul className="grid grid-cols-4 items-end gap-1">
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;

          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                className={
                  item.primary
                    ? "group relative flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 text-[10px] font-semibold text-white transition-all"
                    : `flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 text-[10px] font-medium transition-all sm:text-[11px] ${
                        active
                          ? "bg-gradient-to-b from-indigo-500/20 to-cyan-500/10 text-cyan-100 light:from-indigo-100 light:to-cyan-100 light:text-indigo-700"
                          : "text-slate-400 hover:bg-white/5 hover:text-slate-100 light:text-slate-500 light:hover:bg-slate-100 light:hover:text-slate-800"
                      }`
                }
              >
                {item.primary ? (
                  <span className="absolute -top-5 flex h-11 w-11 items-center justify-center rounded-full border border-cyan-200/50 bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-[0_10px_28px_rgba(34,211,238,0.35)] ring-4 ring-[#0a1022] light:ring-white">
                    <Icon size={21} strokeWidth={2.5} />
                  </span>
                ) : (
                  <Icon size={19} />
                )}
                <span className={item.primary ? "mt-7" : "leading-tight"}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
