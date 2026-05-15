"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Home, Palette, PlusCircle, User2 } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/compose", label: "Create", icon: PlusCircle },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/ai-studio", label: "AI Studio", icon: Palette },
  { href: "/settings", label: "Profile", icon: User2 },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-3 left-1/2 z-50 w-[min(96%,1120px)] -translate-x-1/2 rounded-[30px] border border-white/10 bg-[#0b0f1f]/92 px-2.5 py-2 backdrop-blur-2xl dark:bg-[#0b0f1f]/92 light:border-slate-200 light:bg-white/95 light:shadow-[0_8px_24px_rgba(17,24,39,0.08)]">
      <ul className="flex items-center justify-between">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex min-w-[62px] flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] transition-all lg:min-w-[120px] lg:flex-row lg:justify-center lg:gap-2 lg:text-sm ${
                  active
                    ? "bg-violet-500/20 text-violet-300 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.35)] light:bg-violet-100 light:text-violet-700"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-100 light:text-slate-500 light:hover:bg-slate-100 light:hover:text-slate-800"
                }`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
