"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { useCreatorStore } from "@/lib/store";

export function ThemeToggle() {
  const theme = useCreatorStore((state) => state.theme);
  const setTheme = useCreatorStore((state) => state.setTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("xcr8-theme", theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur transition hover:scale-[1.03] light:border-slate-200 light:bg-white light:text-slate-700"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} className="text-slate-700" />}
    </button>
  );
}
