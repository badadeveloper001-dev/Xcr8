"use client";

import { useState } from "react";
import { MessageSquareQuote, SendHorizontal, Wand2 } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";
import { composeAiContent, getApiErrorMessage, type AiComposeResponse } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

type ChatItem = {
  role: "user" | "assistant";
  content: string;
};

const starterPrompts = [
  "Turn my idea into a LinkedIn post about how I plan my content week.",
  "I want a short, punchy Instagram post about staying consistent without burnout.",
  "Help me write a Thread about my creator workflow in a conversational tone.",
];

export default function ComposerPage() {
  const userId = useCreatorStore((state) => state.userId);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      content:
        "Tell me how you want the content to feel, and I will turn it into a full post idea.",
    },
  ]);
  const [prompt, setPrompt] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [language, setLanguage] = useState("english");
  const [tone, setTone] = useState("conversational");
  const [audienceLocation, setAudienceLocation] = useState("Nigeria");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiComposeResponse | null>(null);

  const submitPrompt = async (value: string) => {
    const nextPrompt = value.trim();
    if (!nextPrompt) {
      setError("Write what you want the content to sound like.");
      return;
    }
    if (!userId) return;

    const nextMessages: ChatItem[] = [...messages, { role: "user", content: nextPrompt }];
    setMessages(nextMessages);
    setLoading(true);
    setError(null);

    try {
      const data = await composeAiContent({
        user_id: userId,
        prompt: nextPrompt,
        platform,
        language,
        tone,
        audience_location: audienceLocation,
        messages: nextMessages.map((message) => ({ role: message.role, content: message.content })),
      });
      setResult(data);
      setMessages([
        ...nextMessages,
        { role: "assistant", content: `${data.assistant_message} ${data.follow_up_question}` },
      ]);
      setPrompt("");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not compose your idea right now. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <StudioShell
      title="AI Studio"
      subtitle="Composer is now on its own page so you can focus on chat-based creation."
      activeToolId="composer"
    >
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-3.5">
          <div className="surface-soft rounded-2xl p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Settings
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="xcr8-input"
              >
                {["instagram", "tiktok", "x", "linkedin", "threads", "youtube_shorts"].map(
                  (item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ),
                )}
              </select>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="xcr8-input"
              >
                {["english", "nigerian_pidgin", "yoruba", "code_switch"].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <select value={tone} onChange={(e) => setTone(e.target.value)} className="xcr8-input">
                {["conversational", "bold", "educational", "funny", "luxury", "motivational"].map(
                  (item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ),
                )}
              </select>
              <input
                value={audienceLocation}
                onChange={(e) => setAudienceLocation(e.target.value)}
                className="xcr8-input"
                placeholder="Audience location"
              />
            </div>
          </div>

          <div className="surface-card rounded-2xl p-4">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-white light:text-slate-900">
              <MessageSquareQuote size={16} className="text-violet-400" />
              Composer chat
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
                    className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${
                      message.role === "user"
                        ? "ml-auto bg-violet-500/15 text-violet-100 light:text-violet-900"
                        : "mr-auto bg-black/20 text-slate-200 light:bg-white light:text-slate-800"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
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
                  placeholder="Ask for an idea, angle, hook, or full content direction..."
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void submitPrompt(prompt)}
                  className="cta-btn inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl disabled:opacity-60"
                  aria-label="Send message"
                >
                  <SendHorizontal size={15} />
                </button>
              </div>
            </div>

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
          {result ? (
            <article className="surface-card rounded-2xl p-4">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
                <Wand2 size={11} />
                Content plan
              </div>
              <h3 className="text-lg font-semibold text-white light:text-slate-900">
                {result.content_plan.title}
              </h3>
              <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
                {result.content_plan.angle}
              </p>
              <div className="mt-3 space-y-2 rounded-xl bg-black/20 p-3 light:bg-slate-50">
                <p className="text-sm text-slate-200 light:text-slate-800">
                  <span className="font-semibold text-violet-300 light:text-violet-700">Hook:</span>{" "}
                  {result.content_plan.hook}
                </p>
                <p className="text-sm text-slate-200 light:text-slate-800">
                  <span className="font-semibold text-violet-300 light:text-violet-700">
                    Intro:
                  </span>{" "}
                  {result.content_plan.intro}
                </p>
                <div className="space-y-1 text-sm text-slate-200 light:text-slate-800">
                  <p className="font-semibold text-violet-300 light:text-violet-700">Body:</p>
                  {result.content_plan.body.map((line, index) => (
                    <p key={`${line}-${index}`}>{line}</p>
                  ))}
                </div>
                <p className="text-sm text-slate-200 light:text-slate-800">
                  <span className="font-semibold text-violet-300 light:text-violet-700">CTA:</span>{" "}
                  {result.content_plan.cta}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.content_plan.hashtags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          ) : (
            <div className="surface-soft rounded-2xl p-4 text-sm text-slate-500 light:text-slate-600">
              Your content plan will appear here after you send a prompt.
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
