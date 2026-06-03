"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, MessageSquarePlus, SendHorizontal, Sparkles } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";
import {
  createAiAssistantChat,
  chatWithAiAssistant,
  deleteAiAssistantChat,
  getAiAssistantChatHistory,
  getApiErrorMessage,
  listAiAssistantChats,
  updateAiAssistantChat,
  type AiAssistantChatSummary,
} from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

type ChatItem = {
  role: "user" | "assistant";
  content: string;
};

const starterPrompts = [
  "Help me plan my next content move based on my current workspace.",
  "Give me a quick summary of my app activity and what to improve.",
  "What is the best next action for my growth this week?",
];

const languageOptions = ["auto", "english", "nigerian_pidgin", "yoruba", "code_switch"];
const MAX_RENDERED_MESSAGES = 240;
const MAX_SENT_MESSAGES = 40;

function activeChatStorageKey(userId: number) {
  return `xcr8-assistant-active-chat:${userId}`;
}

function draftStorageKey(userId: number, chatId: string) {
  return `xcr8-assistant-draft:${userId}:${chatId}`;
}

function messagesStorageKey(userId: number, chatId: string) {
  return `xcr8-assistant-messages:${userId}:${chatId}`;
}

function buildChatTitle(value: string) {
  return value.trim().slice(0, 56) || "New chat";
}

function buildWelcomeMessage(displayName: string | null): ChatItem {
  return {
    role: "assistant",
    content: displayName
      ? `I’m Cr8or AI, ${displayName}. Ask me anything about the app, your content, or your next move.`
      : "I’m Cr8or AI. Ask me anything about the app, your content, or your next move.",
  };
}

function isChatItem(value: unknown): value is ChatItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { role?: unknown; content?: unknown };
  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string" &&
    candidate.content.trim().length > 0
  );
}

export default function AssistantPage() {
  const userId = useCreatorStore((state) => state.userId);
  const email = useCreatorStore((state) => state.email);
  const displayName = useCreatorStore((state) => state.displayName);
  const clearSession = useCreatorStore((state) => state.clearSession);
  const welcomeMessage = useMemo(() => buildWelcomeMessage(displayName), [displayName]);
  const [messages, setMessages] = useState<ChatItem[]>([welcomeMessage]);
  const [chatSessions, setChatSessions] = useState<AiAssistantChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedActions, setSuggestedActions] = useState<string[]>(starterPrompts);
  const lastPromptParamRef = useRef<string | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const [isMobileInputMode, setIsMobileInputMode] = useState(false);
  const [isHistoryReady, setIsHistoryReady] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 1024px), (pointer: coarse)");
    const updateMode = () => setIsMobileInputMode(mediaQuery.matches);
    updateMode();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateMode);
      return () => mediaQuery.removeEventListener("change", updateMode);
    }

    mediaQuery.addListener(updateMode);
    return () => mediaQuery.removeListener(updateMode);
  }, []);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) {
      return;
    }
    list.scrollTop = list.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    const promptParam = new URLSearchParams(window.location.search).get("prompt")?.trim() ?? "";
    if (!promptParam || lastPromptParamRef.current === promptParam) {
      return;
    }

    setPrompt(promptParam);
    lastPromptParamRef.current = promptParam;
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    const loadChatSessions = async () => {
      try {
        let sessions = await listAiAssistantChats(userId, email ?? undefined);
        if (cancelled) {
          return;
        }

        if (sessions.length === 0) {
          const created = await createAiAssistantChat(
            userId,
            { title: "New chat" },
            email ?? undefined,
          );
          if (cancelled) {
            return;
          }
          sessions = [created];
        }

        setChatSessions(sessions);
        const storageKey = activeChatStorageKey(userId);
        const storedChatId = localStorage.getItem(storageKey);
        const nextChatId =
          storedChatId && sessions.some((session) => session.chat_id === storedChatId)
            ? storedChatId
            : (sessions[0]?.chat_id ?? null);
        setActiveChatId(nextChatId);
      } catch {
        if (!cancelled) {
          setChatSessions([]);
          setActiveChatId(null);
          setMessages([welcomeMessage]);
        }
      }
    };

    void loadChatSessions();

    return () => {
      cancelled = true;
    };
  }, [email, userId, welcomeMessage]);

  useEffect(() => {
    if (!userId || !activeChatId) {
      return;
    }

    localStorage.setItem(activeChatStorageKey(userId), activeChatId);
  }, [activeChatId, userId]);

  useEffect(() => {
    if (!userId || !activeChatId) {
      return;
    }

    const draft = localStorage.getItem(draftStorageKey(userId, activeChatId));
    if (typeof draft === "string") {
      setPrompt(draft);
    }

    const cachedMessagesRaw = localStorage.getItem(messagesStorageKey(userId, activeChatId));
    if (cachedMessagesRaw) {
      try {
        const parsed = JSON.parse(cachedMessagesRaw) as unknown;
        if (Array.isArray(parsed)) {
          const restored = parsed.filter(isChatItem).slice(-MAX_RENDERED_MESSAGES);
          if (restored.length > 0) {
            setMessages(restored);
          }
        }
      } catch {
        // Ignore invalid cache and rely on server history.
      }
    }
  }, [activeChatId, userId]);

  useEffect(() => {
    if (!userId || !activeChatId) {
      return;
    }

    localStorage.setItem(draftStorageKey(userId, activeChatId), prompt);
  }, [activeChatId, prompt, userId]);

  useEffect(() => {
    if (!userId || !activeChatId) {
      return;
    }

    localStorage.setItem(
      messagesStorageKey(userId, activeChatId),
      JSON.stringify(messages.slice(-MAX_RENDERED_MESSAGES)),
    );
  }, [activeChatId, messages, userId]);

  useEffect(() => {
    if (!userId || !activeChatId) {
      return;
    }

    setIsHistoryReady(false);

    const hasServerChat = chatSessions.some((session) => session.chat_id === activeChatId);
    if (!hasServerChat) {
      setMessages([welcomeMessage]);
      setIsHistoryReady(true);
      return;
    }

    let cancelled = false;

    const loadChatHistory = async () => {
      try {
        const history = await getAiAssistantChatHistory(userId, activeChatId, email ?? undefined);
        if (cancelled) {
          return;
        }

        const restored = history.messages.filter(isChatItem).slice(-MAX_RENDERED_MESSAGES);
        setMessages(restored.length > 0 ? restored : [welcomeMessage]);
        setIsHistoryReady(true);
      } catch {
        if (!cancelled) {
          setMessages([welcomeMessage]);
          setIsHistoryReady(true);
        }
      }
    };

    void loadChatHistory();

    return () => {
      cancelled = true;
    };
  }, [activeChatId, chatSessions, email, userId, welcomeMessage]);

  const startNewChat = () => {
    if (!userId) {
      return;
    }

    const createChat = async () => {
      try {
        const summary = await createAiAssistantChat(
          userId,
          { title: "New chat" },
          email ?? undefined,
        );
        setActiveChatId(summary.chat_id);
        setMessages([welcomeMessage]);
        setError(null);
        setPrompt("");
        localStorage.removeItem(draftStorageKey(userId, summary.chat_id));
        setSuggestedActions(starterPrompts);
        setChatSessions((current) => [
          summary,
          ...current.filter((session) => session.chat_id !== summary.chat_id),
        ]);
      } catch (err) {
        setError(
          getApiErrorMessage(err, "Could not create a new chat right now. Please try again."),
        );
      }
    };

    void createChat();
  };

  const renameChat = async (session: AiAssistantChatSummary) => {
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
      setChatSessions((current) =>
        current.map((item) => (item.chat_id === updated.chat_id ? updated : item)),
      );
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not rename that chat right now. Please try again."));
    }
  };

  const removeChat = async (session: AiAssistantChatSummary) => {
    if (!userId) {
      return;
    }

    if (!window.confirm(`Delete "${session.title}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteAiAssistantChat(userId, session.chat_id, email ?? undefined);
      setChatSessions((current) => {
        const remaining = current.filter((item) => item.chat_id !== session.chat_id);
        if (session.chat_id === activeChatId) {
          const nextActive = remaining[0]?.chat_id ?? null;
          setActiveChatId(nextActive);
          if (!nextActive) {
            setMessages([welcomeMessage]);
            setSuggestedActions(starterPrompts);
          }
        }
        return remaining;
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete that chat right now. Please try again."));
    }
  };

  const submitPrompt = async (value: string) => {
    if (loading) {
      return;
    }

    if (!isHistoryReady) {
      setError("Please wait a moment while your chat history loads.");
      return;
    }

    const nextPrompt = value.trim();
    if (!nextPrompt) {
      setError("Type a question so I can respond naturally.");
      return;
    }
    if (!userId) {
      setError("Your session is missing. Please log in again to use the assistant.");
      return;
    }

    let currentChatId = activeChatId;
    if (!currentChatId) {
      const created = await createAiAssistantChat(
        userId,
        { title: buildChatTitle(nextPrompt) },
        email ?? undefined,
      );
      currentChatId = created.chat_id;
      setActiveChatId(currentChatId);
      setChatSessions((current) => [
        created,
        ...current.filter((session) => session.chat_id !== created.chat_id),
      ]);
    }

    const userMessage: ChatItem = { role: "user", content: nextPrompt };
    const nextMessages = [...messages, userMessage].slice(-MAX_RENDERED_MESSAGES);
    setMessages(nextMessages);
    setLoading(true);
    setError(null);

    try {
      const data = await chatWithAiAssistant({
        user_id: userId,
        email: email ?? undefined,
        chat_id: currentChatId,
        message: nextPrompt,
        language,
        tone: "auto",
        messages: nextMessages
          .slice(-MAX_SENT_MESSAGES)
          .map((message) => ({ role: message.role, content: message.content })),
      });
      const resolvedChatId = data.chat_id ?? currentChatId;
      const assistantMessage: ChatItem = {
        role: "assistant",
        content: [data.assistant_message, data.follow_up_question]
          .filter(Boolean)
          .join("\n\n")
          .trim(),
      };
      setMessages([...nextMessages, assistantMessage].slice(-MAX_RENDERED_MESSAGES));
      setSuggestedActions(
        data.suggested_actions.length > 0 ? data.suggested_actions : starterPrompts,
      );
      setActiveChatId(resolvedChatId);
      setChatSessions((current) => {
        const existing = current.find((session) => session.chat_id === resolvedChatId);
        const updatedSession: AiAssistantChatSummary = {
          chat_id: resolvedChatId,
          title:
            existing?.title && existing.title !== "New chat"
              ? existing.title
              : buildChatTitle(nextPrompt),
          preview: assistantMessage.content.slice(0, 90),
          updated_at: new Date().toISOString(),
        };

        return [updatedSession, ...current.filter((session) => session.chat_id !== resolvedChatId)];
      });
      setPrompt("");
      localStorage.removeItem(draftStorageKey(userId, resolvedChatId));
    } catch (err) {
      const errorMessage = getApiErrorMessage(
        err,
        "Could not reach the assistant right now. Please try again.",
      );

      if (errorMessage.toLowerCase().includes("user not found")) {
        clearSession();
        setError("Your session has expired. Please log in again.");
        return;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <StudioShell
      title="AI Studio"
      subtitle="Cr8or AI keeps separate chats, remembers context, and stays tied to your creator workspace."
      activeToolId="assistant"
      showToolShelf={false}
    >
      <div className="space-y-4">
        <section className="xcr8-panel rounded-2xl border-2 border-cyan-300/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="xcr8-soft-chip mb-2 inline-flex items-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
                Workspace v3
              </p>
              <h2 className="xcr8-title-lg text-white light:text-slate-900">
                Cr8or Workspace
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="xcr8-input !w-auto min-w-[170px] py-2 text-xs"
              >
                {languageOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={startNewChat}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/15 light:border-cyan-300 light:bg-cyan-50 light:text-cyan-700"
              >
                <MessageSquarePlus size={13} />
                New chat
              </button>
            </div>
          </div>
          <p className="xcr8-subtle mt-2 text-xs">
            Ask naturally. Replies stay aligned with your language, profile context, and recent
            conversation.
          </p>
        </section>

        <div className="grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
          <aside className="xcr8-panel rounded-2xl p-4 xl:max-h-[72dvh] xl:overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <p className="xcr8-eyebrow flex items-center gap-2">
                <Sparkles size={11} />
                Conversations
              </p>
              <span className="text-[11px] text-slate-500">{chatSessions.length}</span>
            </div>
            <div className="space-y-2">
              {chatSessions.length > 0 ? (
                chatSessions.map((session) => {
                  const active = session.chat_id === activeChatId;

                  return (
                    <div
                      key={session.chat_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveChatId(session.chat_id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setActiveChatId(session.chat_id);
                        }
                      }}
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                        active
                          ? "border-cyan-300/35 bg-cyan-500/10 light:border-cyan-300 light:bg-cyan-50"
                          : "border-white/10 bg-white/5 hover:bg-white/10 light:border-slate-200 light:bg-white/70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white light:text-slate-900">
                            {session.title}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-400 light:text-slate-600">
                            {session.preview}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="text-[11px] text-slate-500 light:text-slate-500">
                            {new Date(session.updated_at).toLocaleDateString()}
                          </span>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void renameChat(session);
                              }}
                              className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300 transition hover:bg-white/10 light:text-slate-700"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void removeChat(session);
                              }}
                              className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300 transition hover:bg-rose-500/15 light:text-rose-600"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-3 py-4 text-sm text-slate-500 light:border-slate-200 light:bg-white/70 light:text-slate-600">
                  Your chat list appears here as soon as you send your first message.
                </div>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-slate-400 light:border-slate-200 light:bg-white/70 light:text-slate-600">
              Tip: keep separate chats for planning, content writing, and app questions.
            </div>
          </aside>

          <section className="space-y-3.5">
            <div className="xcr8-panel rounded-2xl border-2 border-indigo-300/30 p-4">
            <h2 className="xcr8-title-lg mb-3 flex items-center gap-2 text-white light:text-slate-900">
              <Bot size={16} className="text-cyan-300" />
              Active conversation
            </h2>

            <div className="mb-3 flex flex-wrap gap-2">
              {starterPrompts.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => void submitPrompt(item)}
                  disabled={loading || !isHistoryReady}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-left text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-60"
                >
                  {item}
                </button>
              ))}
            </div>

            <div
              ref={messageListRef}
              className="mb-3 h-[50dvh] min-h-[320px] max-h-[580px] space-y-3 overflow-y-auto rounded-2xl bg-black/20 p-3 md:h-[450px] light:bg-slate-50"
            >
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className="flex w-full">
                  <div
                    className={`max-w-[92%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-6 md:max-w-[88%] ${
                      message.role === "user"
                        ? "ml-auto bg-cyan-500/15 text-cyan-100 light:text-cyan-900"
                        : "mr-auto bg-black/20 text-slate-200 light:bg-white light:text-slate-800"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitPrompt(prompt);
              }}
              className="rounded-2xl border border-white/10 bg-white/5 p-2"
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (!isMobileInputMode && e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submitPrompt(prompt);
                    }
                  }}
                  className="xcr8-input h-14 min-h-14 resize-none border-none bg-transparent shadow-none"
                  placeholder="Ask about your app, your content, or the next best move..."
                />
                <button
                  type="submit"
                  disabled={loading || !isHistoryReady}
                  className="cta-btn inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl disabled:opacity-60"
                  aria-label="Send message"
                >
                  <SendHorizontal size={15} />
                </button>
              </div>
              <p className="px-1 pt-2 text-[11px] text-slate-500 light:text-slate-600">
                {isMobileInputMode
                  ? "On mobile: tap send to avoid accidental early submits."
                  : "Press Enter to send, Shift+Enter for a new line."}
              </p>
            </form>

            {error ? (
              <p
                role="status"
                className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-400"
              >
                {error}
              </p>
            ) : null}
            </div>

            <article className="xcr8-panel rounded-2xl p-4">
              <p className="xcr8-eyebrow mb-2">Quick prompts</p>
              <div className="flex flex-wrap gap-2">
                {suggestedActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => setPrompt(action)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 light:text-slate-700"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </article>
          </section>
        </div>
      </div>
    </StudioShell>
  );
}
