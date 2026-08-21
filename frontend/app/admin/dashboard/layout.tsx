"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, LayoutDashboard, LogOut, Settings2, Users, FileWarning } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const items = [
  ["/admin/dashboard", "Overview", LayoutDashboard],
  ["/admin/dashboard/creators", "Creators", Users],
  ["/admin/dashboard/content", "Content", FileWarning],
  ["/admin/dashboard/system", "System", Settings2],
  ["/admin/dashboard/pulse", "Pulse", Activity],
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  return <main className="lux-page min-h-screen px-4 py-5">
    <div className="mx-auto max-w-6xl">
      <header className="xcr8-panel mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div><p className="xcr8-eyebrow">Admin Console</p><h1 className="text-lg font-semibold text-white light:text-slate-900">XCR8 Operations</h1></div>
        <div className="flex items-center gap-2"><ThemeToggle /><button onClick={async () => { await fetch("/admin/data/session", { method: "DELETE" }); sessionStorage.removeItem("xcr8-admin-access"); router.replace("/admin"); }} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300"><LogOut size={14} className="mr-1 inline" />Sign out</button></div>
      </header>
      <nav className="mb-5 flex gap-2 overflow-x-auto pb-1">{items.map(([href, label, Icon]) => <Link key={href} href={href} className={pathname === href ? "rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950" : "rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300"}><Icon size={14} className="mr-1 inline" />{label}</Link>)}</nav>
      {children}
    </div>
  </main>;
}