"use client";

import { useEffect } from "react";
import { Laptop2, Moon, Sun } from "lucide-react";
import { useCreatorStore } from "@/lib/store";

export function ThemeToggle() {
  const theme = useCreatorStore((state) => state.theme);
  const setTheme = useCreatorStore((state) => state.setTheme);

  useEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
    document.documentElement.classList.toggle("dark", resolved === "dark");
    localStorage.setItem("xcr8-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      document.documentElement.classList.toggle("dark", media.matches);
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [theme]);

  const cycleTheme = () => {
    if (theme === "dark") {
      setTheme("light");
      return;
    }
    if (theme === "light") {
      setTheme("system");
      return;
    }
    setTheme("dark");
  };

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur transition hover:scale-[1.03] light:border-slate-200 light:bg-white light:text-slate-700"
      aria-label={`Theme: ${theme}. Toggle theme`}
      title={`Theme: ${theme}`}
    >
      {theme === "dark" ? <Sun size={16} /> : null}
      {theme === "light" ? <Moon size={16} className="text-slate-700" /> : null}
      {theme === "system" ? <Laptop2 size={16} className="text-violet-300" /> : null}
    </button>
  );
}
