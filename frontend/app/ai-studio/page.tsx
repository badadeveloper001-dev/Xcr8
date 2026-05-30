"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Bot, MessageSquareQuote, Sparkles, Wand2 } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import {
  composeAiContent,
  getApiErrorMessage,
  type AiComposeResponse,
  type AiConversationMessage,
} from "@/lib/api";
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

export default function AIStudioPage() {
  const router = useRouter();
  const userId = useCreatorStore((state) => state.userId);
  const creatorName =
    useCreatorStore((state) => state.fullName) ??
    useCreatorStore((state) => state.displayName) ??
    "Creator";
  const creatorProfile = useCreatorStore((state) => ({
    platform: state.distributionDraft
      ? (state.distributionDraft.variants[0]?.platform ?? "instagram")
      : "instagram",
  }));

  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      content: "Tell me how you want the content to feel, and I’ll turn it into a full post idea.",
    },
  ]);
  const [prompt, setPrompt] = useState(
    "Write a post about creator consistency with a practical, local tone.",
  );
  const [platform, setPlatform] = useState("instagram");
  const [language, setLanguage] = useState("english");
  const [tone, setTone] = useState("conversational");
  const [audienceLocation, setAudienceLocation] = useState("Nigeria");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiComposeResponse | null>(null);

  useEffect(() => {
    if (!userId) router.replace("/auth/login");
  }, [router, userId]);

  const conversation = useMemo<AiConversationMessage[]>(
    () => messages.map((message) => ({ role: message.role, content: message.content })),
    [messages],
  );

  if (!userId) return null;

  const submitPrompt = async (value: string) => {
    const nextPrompt = value.trim();
    if (!nextPrompt) {
      setError("Write what you want the content to sound like.");
      return;
    }

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitPrompt(prompt);
  };

  return (
    <MobileShell title="AI Studio" subtitle="Talk to the composer like a normal creative partner.">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="surface-luxe cyber-grid scanline rounded-2xl p-4"
      >
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
          <Sparkles size={12} />
          Conversational composing AI
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-3.5">
            <div className="surface-soft rounded-2xl p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ask naturally
              </p>
              <h2 className="text-lg font-semibold text-white light:text-slate-900">
                What do you want the content to say?
              </h2>
              <p className="mt-1 text-sm text-slate-400 light:text-slate-600">
                You can write it like you would to a creative partner. I’ll turn it into a complete
                content idea.
              </p>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
              <div className="surface-soft rounded-2xl p-4">
                <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Bot size={11} /> Message to AI
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="xcr8-input h-36 resize-none"
                  placeholder="Example: I want a warm but confident LinkedIn post that explains how I batch content on Sundays and still sound natural."
                />
                <p className="mt-2 text-xs text-slate-500">
                  {creatorName}, just describe the vibe, platform, or angle you want.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="surface-soft rounded-2xl p-4">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Platform
                  </label>
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
                </div>
                <div className="surface-soft rounded-2xl p-4">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Language
                  </label>
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
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="surface-soft rounded-2xl p-4">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tone
                  </label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="xcr8-input"
                  >
                    {[
                      "conversational",
                      "bold",
                      "educational",
                      "funny",
                      "luxury",
                      "motivational",
                    ].map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="surface-soft rounded-2xl p-4">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Audience location
                  </label>
                  <input
                    value={audienceLocation}
                    onChange={(e) => setAudienceLocation(e.target.value)}
                    className="xcr8-input"
                    placeholder="Nigeria, UK, Global..."
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="cta-btn inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold disabled:opacity-60"
              >
                {loading ? "Thinking…" : "Generate content idea"}
                {!loading ? <ArrowRight size={16} /> : null}
              </button>

              {error ? (
                <p
                  role="status"
                  className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-400"
                >
                  {error}
                </p>
              ) : null}
            </form>

            <div className="surface-soft rounded-2xl p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Quick prompts
              </p>
              <div className="flex flex-wrap gap-2">
                {starterPrompts.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPrompt(item)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-left text-xs text-slate-300 transition hover:bg-white/10"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3.5">
            <div className="surface-soft rounded-2xl p-4">
              <h2 className="mb-1.5 flex items-center gap-2 text-base font-semibold text-white light:text-slate-900">
                <MessageSquareQuote size={16} className="text-violet-400" />
                Conversation
              </h2>
              <div className="space-y-3">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      message.role === "user"
                        ? "ml-8 bg-violet-500/15 text-violet-100 light:text-violet-900"
                        : "mr-8 bg-black/20 text-slate-200 light:bg-slate-50 light:text-slate-800"
                    }`}
                  >
                    {message.content}
                  </div>
                ))}
              </div>
            </div>

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
                    <span className="font-semibold text-violet-300 light:text-violet-700">
                      Hook:
                    </span>{" "}
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
                    <span className="font-semibold text-violet-300 light:text-violet-700">
                      CTA:
                    </span>{" "}
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
                <div className="mt-3 text-xs text-slate-500">
                  Model: {result.model} · {result.latency_ms}ms · template{" "}
                  {result.prompt_template_version}
                </div>
              </article>
            ) : (
              <div className="surface-soft rounded-2xl p-4 text-sm text-slate-500 light:text-slate-600">
                Your content plan will appear here after you send a prompt.
              </div>
            )}
          </div>
        </div>
      </motion.section>
    </MobileShell>
  );
}
