"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, History, MessageSquarePlus, SendHorizontal } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";
import {
  chatWithAiAssistant,
  submitAiAssistantFeedback,
  getAiAssistantChatHistory,
  getApiErrorMessage,
  listAiAssistantChats,
  type AiAssistantChatSummary,
} from "@/lib/api";
import { useCreatorStore } from "@/lib/store";
import { useActiveCreatorIdentity } from "@/lib/use-active-creator-identity";

type ChatItem = {
  role: "user" | "assistant";
  content: string;
};

const starterPrompts = [
  "Brainstorm 5 original post ideas for my niche.",
  "Turn one of my ideas into a platform-ready post.",
  "Review my analytics and tell me what to repeat next.",
  "Build a 7-day content plan around my strongest platform.",
];

const languageOptions = ["auto", "english", "nigerian_pidgin", "yoruba", "code_switch"];
const MAX_RENDERED_MESSAGES = 240;
const MAX_SENT_MESSAGES = 40;

// Storage keys are scoped to email (stable across DB resets).
// The ":e:" prefix avoids collisions with legacy userId-based keys.
function chatSessionsStorageKey(email: string) {
  return `xcr8-assistant-chat-summaries:e:${email}`;
}

function activeChatStorageKey(email: string) {
  return `xcr8-assistant-active-chat:e:${email}`;
}

function draftStorageKey(email: string, chatId: string) {
  return `xcr8-assistant-draft:e:${email}:${chatId}`;
}

function messagesStorageKey(email: string, chatId: string) {
  return `xcr8-assistant-messages:e:${email}:${chatId}`;
}

/** One-time silent migration from the old userId-scoped key to the email-scoped key. */
function migrateLegacyKey(newKey: string, oldKey: string): string | null {
  const existing = localStorage.getItem(newKey);
  if (existing) return existing;
  const legacy = localStorage.getItem(oldKey);
  if (!legacy) return null;
  localStorage.setItem(newKey, legacy);
  localStorage.removeItem(oldKey);
  return legacy;
}

function buildChatTitle(value: string) {
  return value.trim().slice(0, 56) || "New chat";
}

function buildClientChatId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `chat-${crypto.randomUUID().slice(0, 12)}`;
  }
  return `chat-${Math.random().toString(36).slice(2, 14)}`;
}

function buildWelcomeMessage(displayName: string | null): ChatItem {
  return {
    role: "assistant",
    content: displayName
      ? `I’m Cr8or AI, ${displayName}. I can brainstorm ideas, compose platform-ready posts, and help you turn your analytics into your next best move.`
      : "I’m Cr8or AI. I can brainstorm ideas, compose platform-ready posts, and help you turn your analytics into your next best move.",
  };
}

function buildSeededAssistantMessage(message: string): ChatItem {
  return {
    role: "assistant",
    content: message,
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

export default function AssistantPage() {
  const userId = useCreatorStore((state) => state.userId);
  const email = useCreatorStore((state) => state.email);
  const { activeName } = useActiveCreatorIdentity();
  const searchParams = useSearchParams();
  const welcomeMessage = useMemo(() => buildWelcomeMessage(activeName), [activeName]);
  const [messages, setMessages] = useState<ChatItem[]>([welcomeMessage]);
  const [chatSessions, setChatSessions] = useState<AiAssistantChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedActions, setSuggestedActions] = useState<string[]>(starterPrompts);
  const [feedbackTarget, setFeedbackTarget] = useState<{ chatId: string; response: string; model: string } | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<"helpful" | "not_helpful" | null>(null);
  const lastPromptParamRef = useRef<string | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const [isMobileInputMode, setIsMobileInputMode] = useState(false);
  const [isHistoryReady, setIsHistoryReady] = useState(true);
  const [requestedChatId, setRequestedChatId] = useState<string | null>(null);
  const lastAssistantSeedRef = useRef<string | null>(null);

  useEffect(() => {
    const forceFreshChat = searchParams.get("fresh") === "1";
    const nextChatId = searchParams.get("chat")?.trim() || null;
    setRequestedChatId((current) => (current === nextChatId ? current : nextChatId));

    const nextAssistantSeed = searchParams.get("assistant_seed")?.trim() || "";
    if (forceFreshChat && nextAssistantSeed && lastAssistantSeedRef.current !== nextAssistantSeed) {
      setActiveChatId(null);
      setMessages([buildSeededAssistantMessage(nextAssistantSeed)]);
      setError(null);
      setIsHistoryReady(true);
      lastAssistantSeedRef.current = nextAssistantSeed;
    }

    const nextPrompt = searchParams.get("prompt")?.trim() || "";
    if (nextPrompt && lastPromptParamRef.current !== nextPrompt) {
      setPrompt(nextPrompt);
      lastPromptParamRef.current = nextPrompt;
    }
  }, [searchParams]);

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
    if (!requestedChatId) {
      return;
    }

    setActiveChatId(requestedChatId);
    setError(null);
    setIsHistoryReady(false);
  }, [requestedChatId]);

  useEffect(() => {
    if (!userId || !email) {
      return;
    }

    let cancelled = false;

    const loadChatSessions = async () => {
      const storageKey = activeChatStorageKey(email);
      const sessionsKey = chatSessionsStorageKey(email);

      // One-time silent migration from the old userId-scoped key.
      migrateLegacyKey(sessionsKey, `xcr8-assistant-chat-summaries:${userId}`);
      migrateLegacyKey(storageKey, `xcr8-assistant-active-chat:${userId}`);

      let cachedSessions: AiAssistantChatSummary[] = [];
      const cachedRaw = localStorage.getItem(sessionsKey);
      if (cachedRaw) {
        try {
          const parsed = JSON.parse(cachedRaw) as unknown;
          if (Array.isArray(parsed)) {
            cachedSessions = parsed.filter(isChatSummary);
          }
        } catch {
          cachedSessions = [];
        }
      }

      if (cachedSessions.length > 0) {
        setChatSessions(cachedSessions);
        const storedChatId = localStorage.getItem(storageKey);
        const forceFreshChat = searchParams.get("fresh") === "1";
        const cachedActive = forceFreshChat
          ? null
          : (requestedChatId ??
            (storedChatId && cachedSessions.some((session) => session.chat_id === storedChatId)
              ? storedChatId
              : (cachedSessions[0]?.chat_id ?? null)));
        setActiveChatId(cachedActive);
      }

      try {
        let sessions = await listAiAssistantChats(userId, email ?? undefined);
        if (cancelled) {
          return;
        }

        if (sessions.length === 0 && cachedSessions.length > 0) {
          sessions = cachedSessions;
        }

        setChatSessions(sessions);
        const storedChatId = localStorage.getItem(storageKey);
        const forceFreshChat = searchParams.get("fresh") === "1";
        const nextChatId = forceFreshChat
          ? null
          : (requestedChatId ??
            (storedChatId && sessions.some((session) => session.chat_id === storedChatId)
              ? storedChatId
              : (sessions[0]?.chat_id ?? null)));
        setActiveChatId(nextChatId);
      } catch {
        if (!cancelled) {
          if (cachedSessions.length > 0) {
            setChatSessions(cachedSessions);
            const storedChatId = localStorage.getItem(storageKey);
            const forceFreshChat = searchParams.get("fresh") === "1";
            const nextChatId = forceFreshChat
              ? null
              : (requestedChatId ??
                (storedChatId && cachedSessions.some((session) => session.chat_id === storedChatId)
                  ? storedChatId
                  : (cachedSessions[0]?.chat_id ?? null)));
            setActiveChatId(nextChatId);
          } else {
            setChatSessions([]);
            setActiveChatId(searchParams.get("fresh") === "1" ? null : (requestedChatId ?? null));
            setMessages([welcomeMessage]);
          }
        }
      }
    };

    void loadChatSessions();

    return () => {
      cancelled = true;
    };
  }, [email, requestedChatId, searchParams, userId, welcomeMessage]);

  useEffect(() => {
    if (!email) {
      return;
    }

    localStorage.setItem(chatSessionsStorageKey(email), JSON.stringify(chatSessions));
  }, [chatSessions, email]);

  useEffect(() => {
    if (!email || !activeChatId) {
      return;
    }

    localStorage.setItem(activeChatStorageKey(email), activeChatId);
  }, [activeChatId, email]);

  useEffect(() => {
    if (!email || !activeChatId) {
      return;
    }

    const draft = localStorage.getItem(draftStorageKey(email, activeChatId));
    if (typeof draft === "string") {
      setPrompt(draft);
    }

    const cachedMessagesRaw = localStorage.getItem(messagesStorageKey(email, activeChatId));
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
  }, [activeChatId, email]);

  useEffect(() => {
    if (!email || !activeChatId) {
      return;
    }

    localStorage.setItem(draftStorageKey(email, activeChatId), prompt);
  }, [activeChatId, email, prompt]);

  useEffect(() => {
    if (!email || !activeChatId) {
      return;
    }

    localStorage.setItem(
      messagesStorageKey(email, activeChatId),
      JSON.stringify(messages.slice(-MAX_RENDERED_MESSAGES)),
    );
  }, [activeChatId, email, messages]);

  useEffect(() => {
    if (!userId || !activeChatId) {
      return;
    }

    setIsHistoryReady(false);

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
          setError("Could not load this chat right now. Showing your latest local copy.");
          setIsHistoryReady(true);
        }
      }
    };

    void loadChatHistory();

    return () => {
      cancelled = true;
    };
  }, [activeChatId, email, userId, welcomeMessage]);

  const startNewChat = () => {
    if (!userId) {
      return;
    }

    const chatId = buildClientChatId();
    const summary: AiAssistantChatSummary = {
      chat_id: chatId,
      title: "New chat",
      preview: "Start a fresh conversation with Cr8or AI.",
      updated_at: new Date().toISOString(),
    };

    setActiveChatId(chatId);
    setMessages([welcomeMessage]);
    setError(null);
    setPrompt("");
    if (email) localStorage.removeItem(draftStorageKey(email, chatId));
    setSuggestedActions(starterPrompts);
    setChatSessions((current) => [
      summary,
      ...current.filter((session) => session.chat_id !== chatId),
    ]);
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

    const currentChatId = activeChatId ?? buildClientChatId();
    if (!activeChatId) {
      setActiveChatId(currentChatId);
      setChatSessions((current) => [
        {
          chat_id: currentChatId,
          title: buildChatTitle(nextPrompt),
          preview: nextPrompt.slice(0, 90),
          updated_at: new Date().toISOString(),
        },
        ...current.filter((session) => session.chat_id !== currentChatId),
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
        content: data.assistant_message.trim(),
      };
      setMessages([...nextMessages, assistantMessage].slice(-MAX_RENDERED_MESSAGES));
      setSuggestedActions(
        data.suggested_actions.length > 0 ? data.suggested_actions : starterPrompts,
      );
      setActiveChatId(resolvedChatId);
      setFeedbackTarget({ chatId: resolvedChatId, response: assistantMessage.content, model: data.model });
      setFeedbackSent(null);
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
      if (email) localStorage.removeItem(draftStorageKey(email, resolvedChatId));
    } catch (err) {
      const errorMessage = getApiErrorMessage(
        err,
        "Could not reach the assistant right now. Please try again.",
      );

      if (errorMessage.toLowerCase().includes("user not found")) {
        setError("We could not load your assistant profile yet. Please retry in a moment.");
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
      subtitle="Brainstorm, compose, and grow with Cr8or AI."
      activeToolId="assistant"
      showToolShelf={false}
    >
      <div className="space-y-4">
        <section className="ai-stage p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="xcr8-title-lg text-white light:text-slate-900">Cr8or AI Workspace</h2>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Link
                href="/ai-studio/assistant/history"
                className="inline-flex items-center gap-1.5 rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-300 transition hover:bg-violet-500/20"
              >
                <History size={13} />
                History
              </Link>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="xcr8-input w-full min-w-0 py-2 text-xs sm:w-auto sm:min-w-[150px]"
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
        </section>

        <section className="min-w-0 space-y-3.5">
          <div className="ai-stage min-w-0 overflow-x-hidden p-4">
            <h2 className="xcr8-title-lg mb-3 flex items-center gap-2 text-white light:text-slate-900">
              <Bot size={16} className="text-cyan-300" />
              Conversation
            </h2>

            <div
              ref={messageListRef}
              className="ai-chat-log mb-3 h-[46dvh] min-h-[260px] max-h-[580px] space-y-3 overflow-x-hidden overflow-y-auto p-3 md:h-[450px] md:min-h-[320px]"
            >
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className="flex w-full">
                  <div
                    className={`ai-msg min-w-0 max-w-[92%] whitespace-pre-wrap break-words md:max-w-[88%] ${
                      message.role === "user" ? "ai-msg-user ml-auto" : "ai-msg-assistant mr-auto"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
            </div>

            {feedbackTarget ? (
              <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
                <span>Was this response useful?</span>
                {(["helpful", "not_helpful"] as const).map((rating) => (
                  <button key={rating} type="button" disabled={feedbackSent !== null} onClick={async () => {
                    if (!userId) return;
                    await submitAiAssistantFeedback({ user_id: userId, chat_id: feedbackTarget.chatId, rating, response_excerpt: feedbackTarget.response, model: feedbackTarget.model });
                    setFeedbackSent(rating);
                  }} className="rounded-lg border border-white/10 px-2.5 py-1 text-slate-300 disabled:opacity-60">
                    {rating === "helpful" ? "Helpful" : "Not helpful"}
                  </button>
                ))}
                {feedbackSent ? <span className="text-emerald-300">Thanks — this improves Cr8or AI.</span> : null}
              </div>
            ) : null}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitPrompt(prompt);
              }}
              className="rounded-2xl border border-white/10 bg-white/5 p-2 light:border-slate-300 light:bg-white/80"
            >
              <div className="flex w-full min-w-0 items-end gap-2">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (!isMobileInputMode && e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submitPrompt(prompt);
                    }
                  }}
                  className="xcr8-input h-14 min-h-14 min-w-0 flex-1 resize-none border-none bg-transparent shadow-none"
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

          <div className="flex flex-wrap gap-2">
            {suggestedActions.slice(0, 3).map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => setPrompt(action)}
                className="ai-prompt-btn"
              >
                {action}
              </button>
            ))}
          </div>
        </section>
      </div>
    </StudioShell>
  );
}
