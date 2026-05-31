"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Bot, Lightbulb, SendHorizontal, Sparkles } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";
import { chatWithAiAssistant, getApiErrorMessage, type AiAssistantResponse } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

type ChatItem = {
  role: "user" | "assistant";
  content: string;
};

const starterPrompts = [
  "What does Xcr8 already know about my creator profile?",
  "Help me plan my next content move based on my current workspace.",
  "Give me a quick summary of my app activity in a friendly tone.",
];

const vibeOptions = ["friendly", "direct", "premium", "playful", "calm", "hype"];
const toneOptions = ["conversational", "bold", "educational", "warm", "sharp", "luxury"];
const languageOptions = ["auto", "english", "nigerian_pidgin", "yoruba", "code_switch"];

export default function AssistantPage() {
  const userId = useCreatorStore((state) => state.userId);
  const displayName = useCreatorStore((state) => state.displayName);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      content: displayName
        ? `I’m your Xcr8 assistant, ${displayName}. Ask me anything about the app, your content, or your next move.`
        : "I’m your Xcr8 assistant. Ask me anything about the app, your content, or your next move.",
    },
  ]);
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("auto");
  const [tone, setTone] = useState("conversational");
  const [vibe, setVibe] = useState("friendly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiAssistantResponse | null>(null);

  const submitPrompt = async (value: string) => {
    const nextPrompt = value.trim();
    if (!nextPrompt) {
      setError("Type a question so I can respond naturally.");
      return;
    }
    if (!userId) return;

    const nextMessages: ChatItem[] = [...messages, { role: "user", content: nextPrompt }];
    setMessages(nextMessages);
    setLoading(true);
    setError(null);

    try {
      const data = await chatWithAiAssistant({
        user_id: userId,
        message: nextPrompt,
        language,
        tone,
        vibe,
        messages: nextMessages.map((message) => ({ role: message.role, content: message.content })),
      });
      setResult(data);
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: `${data.assistant_message} ${data.follow_up_question}`.trim(),
        },
      ]);
      setPrompt("");
    } catch (err) {
      setError(
        getApiErrorMessage(err, "Could not reach the assistant right now. Please try again."),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <StudioShell
      title="AI Studio"
      subtitle="The central assistant knows your app, your profile, and your content context."
      activeToolId="assistant"
      showToolShelf={false}
    >
      <div className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">
        <div className="space-y-3.5">
          <div className="surface-soft rounded-2xl p-4">
            <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Bot size={11} />
              Assistant settings
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="xcr8-input"
              >
                {languageOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select value={tone} onChange={(e) => setTone(e.target.value)} className="xcr8-input">
                {toneOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select value={vibe} onChange={(e) => setVibe(e.target.value)} className="xcr8-input">
                {vibeOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="surface-card rounded-2xl p-4">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-white light:text-slate-900">
              <Sparkles size={16} className="text-cyan-300" />
              Central assistant chat
            </h2>

            <div className="mb-3 flex flex-wrap gap-2">
              {starterPrompts.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => void submitPrompt(item)}
                  disabled={loading}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-left text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-60"
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="mb-3 h-[420px] space-y-3 overflow-y-auto rounded-2xl bg-black/20 p-3 light:bg-slate-50">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className="flex w-full">
                  <div
                    className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-6 ${
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
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submitPrompt(prompt);
                    }
                  }}
                  className="xcr8-input h-14 min-h-14 resize-none border-none bg-transparent shadow-none"
                  placeholder="Ask about your app, your content, or the next best move..."
                />
                <button
                  type="submit"
                  disabled={loading}
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
        </div>

        <div className="space-y-3.5">
          <article className="surface-soft rounded-2xl p-4">
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Lightbulb size={11} />
              What it knows
            </p>
            <div className="space-y-2 text-sm text-slate-300 light:text-slate-700">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 light:border-slate-200 light:bg-white/70">
                Your profile, tone, and onboarding context.
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 light:border-slate-200 light:bg-white/70">
                Recent posts, dashboard activity, and creator memories.
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 light:border-slate-200 light:bg-white/70">
                Language-aware replies that adapt to your vibe.
              </div>
            </div>
          </article>

          {result ? (
            <article className="surface-card rounded-2xl p-4">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300 light:border-cyan-500/20 light:bg-cyan-50 light:text-cyan-700">
                <Sparkles size={11} />
                Assistant reply
              </div>
              <h3 className="text-lg font-semibold text-white light:text-slate-900">
                {result.follow_up_question}
              </h3>
              <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
                {result.assistant_message}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {result.suggested_actions.map((action) => (
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
              <div className="mt-4 rounded-xl bg-black/20 p-3 text-xs text-slate-400 light:bg-slate-50 light:text-slate-600">
                Model: {result.model} · Language: {result.language} · Tone: {result.tone}
              </div>
            </article>
          ) : (
            <div className="surface-soft rounded-2xl p-4 text-sm text-slate-500 light:text-slate-600">
              The assistant reply will appear here after you send a message.
            </div>
          )}

          <div className="surface-soft rounded-2xl p-4 text-sm text-slate-400 light:text-slate-600">
            Use the assistant to ask app questions, review your content context, or set the tone for
            a reply that matches the user’s language.
          </div>
        </div>
      </div>
    </StudioShell>
  );
}
