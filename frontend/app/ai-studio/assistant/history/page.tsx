"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, History, Pencil, Trash2 } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";
import {
  deleteAiAssistantChat,
  getApiErrorMessage,
  listAiAssistantChats,
  updateAiAssistantChat,
  type AiAssistantChatSummary,
} from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

function chatSessionsStorageKey(userId: number) {
  return `xcr8-assistant-chat-summaries:${userId}`;
}

function activeChatStorageKey(userId: number) {
  return `xcr8-assistant-active-chat:${userId}`;
}

function isChatSummary(value: unknown): value is AiAssistantChatSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    chat_id?: unknown;
    title?: unknown;
    preview?: unknown;
    updated_at?: unknown;
  };

  return (
    typeof candidate.chat_id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.preview === "string" &&
    typeof candidate.updated_at === "string"
  );
}

function formatUpdatedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Recently";
  }
  return parsed.toLocaleString();
}

export default function AssistantHistoryPage() {
  const userId = useCreatorStore((state) => state.userId);
  const email = useCreatorStore((state) => state.email);
  const [sessions, setSessions] = useState<AiAssistantChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const sessionsKey = chatSessionsStorageKey(userId);

    const load = async () => {
      const cachedRaw = localStorage.getItem(sessionsKey);
      if (cachedRaw) {
        try {
          const parsed = JSON.parse(cachedRaw) as unknown;
          if (Array.isArray(parsed)) {
            const cached = parsed.filter(isChatSummary);
            if (cached.length > 0) {
              setSessions(cached);
            }
          }
        } catch {
          // Ignore invalid cache values.
        }
      }

      try {
        const fetched = await listAiAssistantChats(userId, email ?? undefined);
        if (cancelled) {
          return;
        }

        if (fetched.length > 0) {
          setSessions(fetched);
          localStorage.setItem(sessionsKey, JSON.stringify(fetched));
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Could not load your assistant history right now."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [email, userId]);

  const renameSession = async (session: AiAssistantChatSummary) => {
    if (!userId) {
      return;
    }

    const nextTitle = window.prompt("Rename this chat", session.title)?.trim();
    if (!nextTitle || nextTitle === session.title) {
      return;
    }

    try {
      const updated = await updateAiAssistantChat(
        userId,
        session.chat_id,
        { title: nextTitle },
        email ?? undefined,
      );
      setSessions((current) => {
        const next = current.map((item) => (item.chat_id === updated.chat_id ? updated : item));
        localStorage.setItem(chatSessionsStorageKey(userId), JSON.stringify(next));
        return next;
      });
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not rename that chat right now."));
    }
  };

  const deleteSession = async (session: AiAssistantChatSummary) => {
    if (!userId) {
      return;
    }

    if (!window.confirm(`Delete "${session.title}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteAiAssistantChat(userId, session.chat_id, email ?? undefined);
      setSessions((current) => {
        const remaining = current.filter((item) => item.chat_id !== session.chat_id);
        const activeKey = activeChatStorageKey(userId);
        const currentActive = localStorage.getItem(activeKey);
        if (currentActive === session.chat_id) {
          if (remaining[0]) {
            localStorage.setItem(activeKey, remaining[0].chat_id);
          } else {
            localStorage.removeItem(activeKey);
          }
        }
        localStorage.setItem(chatSessionsStorageKey(userId), JSON.stringify(remaining));
        return remaining;
      });
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete that chat right now."));
    }
  };

  return (
    <StudioShell
      title="AI Studio"
      subtitle="Browse all Cr8or AI conversations in one place."
      activeToolId="assistant"
      showToolShelf={false}
    >
      <div className="space-y-4">
        <section className="ai-stage p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History size={15} className="text-violet-300" />
              <h2 className="xcr8-title-lg text-white light:text-slate-900">Chat History</h2>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/ai-studio/assistant"
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/15 light:border-cyan-300 light:bg-cyan-50 light:text-cyan-700"
              >
                <ArrowLeft size={13} />
                Back to chat
              </Link>
            </div>
          </div>
        </section>

        <section className="ai-stage p-4">
          {loading ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-3 py-4 text-sm text-slate-400 light:border-slate-200 light:bg-white/70 light:text-slate-600">
              Loading your chat history...
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-3 py-4 text-sm text-slate-400 light:border-slate-200 light:bg-white/70 light:text-slate-600">
              No chats yet. Start a conversation and it will appear here.
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.chat_id}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 transition hover:bg-white/10 light:border-slate-200 light:bg-white/70"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white light:text-slate-900">
                        {session.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-400 light:text-slate-600">
                        {session.preview || "No preview available."}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Updated {formatUpdatedAt(session.updated_at)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void renameSession(session)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-white/10 light:text-slate-700"
                      >
                        <Pencil size={12} />
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteSession(session)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-300 transition hover:bg-rose-500/15 light:text-rose-600"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                      <Link
                        href={`/ai-studio/assistant?chat=${encodeURIComponent(session.chat_id)}`}
                        className="inline-flex items-center rounded-lg border border-cyan-300/25 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-500/15 light:border-cyan-300 light:bg-cyan-50 light:text-cyan-700"
                      >
                        Open
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error ? (
            <p
              role="status"
              className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-400"
            >
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </StudioShell>
  );
}
