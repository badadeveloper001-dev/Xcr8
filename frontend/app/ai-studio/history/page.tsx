"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";
import { useCreatorStore } from "@/lib/store";

type HistoryItem = {
  id: string;
  title: string;
  src: string;
  downloadName: string;
  prompt: string;
  createdAt: string;
};

const HISTORY_LIMIT = 30;

export default function ImageHistoryPage() {
  const userId = useCreatorStore((s) => s.userId);
  const historyStorageKey = useMemo(() => "xcr8-image-history:v2", []);

  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      let raw = window.localStorage.getItem(historyStorageKey);

      // Migrate from legacy per-user key when available.
      if (!raw) {
        const legacyKey = `xcr8-image-history:v1:${userId ?? "anon"}`;
        const legacyRaw = window.localStorage.getItem(legacyKey);
        if (legacyRaw) {
          raw = legacyRaw;
          window.localStorage.setItem(historyStorageKey, legacyRaw);
        }
      }

      if (!raw) {
        setHistory([]);
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setHistory([]);
        return;
      }

      const safe = parsed
        .filter(
          (entry): entry is HistoryItem =>
            typeof entry === "object" &&
            entry !== null &&
            "id" in entry &&
            "title" in entry &&
            "src" in entry &&
            "downloadName" in entry &&
            "prompt" in entry &&
            "createdAt" in entry &&
            typeof entry.id === "string" &&
            typeof entry.title === "string" &&
            typeof entry.src === "string" &&
            typeof entry.downloadName === "string" &&
            typeof entry.prompt === "string" &&
            typeof entry.createdAt === "string",
        )
        .slice(0, HISTORY_LIMIT);

      setHistory(safe);
    } catch {
      setHistory([]);
    }
  }, [historyStorageKey, userId]);

  const handleDownload = (src: string, fileName: string) => {
    const anchor = document.createElement("a");
    anchor.href = src;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const clearHistory = () => {
    setHistory([]);
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(historyStorageKey);
  };

  return (
    <StudioShell
      title="History"
      subtitle="All generated images across your sessions."
      showToolShelf={false}
    >
      <section className="surface-card rounded-2xl p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="section-kicker">Generation History</p>
            <p className="text-xs text-slate-400 light:text-slate-600">
              {history.length} saved image{history.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/ai-studio/image-generator"
              className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-300 transition hover:bg-violet-500/20"
            >
              Back to Generator
            </Link>
            {history.length ? (
              <button
                type="button"
                onClick={clearHistory}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700"
              >
                Clear history
              </button>
            ) : null}
          </div>
        </div>

        {history.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {history.map((item) => (
              <article key={item.id} className="surface-soft rounded-xl p-3">
                <img
                  src={item.src}
                  alt={item.title}
                  loading="lazy"
                  className="h-auto w-full rounded-lg border border-white/10 bg-black/20 object-cover"
                />
                <p className="mt-2 text-sm font-medium text-white light:text-slate-900">
                  {item.title}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {new Date(item.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 line-clamp-3 text-xs text-slate-400 light:text-slate-600">
                  {item.prompt}
                </p>
                <button
                  type="button"
                  onClick={() => handleDownload(item.src, item.downloadName)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700"
                >
                  <Download size={12} />
                  Download
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="surface-soft rounded-xl p-4 text-sm text-slate-500 light:text-slate-600">
            No image history yet. Generate images in the workspace and they will appear here.
          </div>
        )}
      </section>
    </StudioShell>
  );
}
