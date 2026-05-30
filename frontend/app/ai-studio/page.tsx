"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ImagePlus,
  Lightbulb,
  MessageSquareQuote,
  Mic,
  SendHorizontal,
  Sparkles,
  TrendingUp,
  Wand2,
} from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import {
  composeAiContent,
  generateAiBrainstorm,
  getApiErrorMessage,
  type AiBrainstormResponse,
  type AiComposeResponse,
} from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

type ChatItem = {
  role: "user" | "assistant";
  content: string;
};

type StudioToolId = "composer" | "brainstorm" | "image-generator" | "voiceover" | "trend-mapper";

type StudioTool = {
  id: StudioToolId;
  name: string;
  tagline: string;
  description: string;
  status: "live" | "next" | "planned";
  icon: typeof Wand2;
};

const starterPrompts = [
  "Turn my idea into a LinkedIn post about how I plan my content week.",
  "I want a short, punchy Instagram post about staying consistent without burnout.",
  "Help me write a Thread about my creator workflow in a conversational tone.",
];

const brainstormPrompts = [
  "Weekly content system for creators",
  "How local brands can make better short-form content",
  "A creator-friendly content series around consistency without burnout",
];

const studioTools: StudioTool[] = [
  {
    id: "composer",
    name: "Composer",
    tagline: "Talk your way into a full post concept.",
    description: "Conversational writing partner for posts, hooks, structure, and CTA.",
    status: "live",
    icon: Wand2,
  },
  {
    id: "brainstorm",
    name: "Brainstorm",
    tagline: "Generate batches of angles and hooks fast.",
    description: "Idea engine for campaigns, content series, and creator brand growth.",
    status: "live",
    icon: Lightbulb,
  },
  {
    id: "image-generator",
    name: "Image Generator",
    tagline: "Create visual concepts for posts and promos.",
    description: "AI art directions, cover concepts, ad creatives, and thumbnails.",
    status: "next",
    icon: ImagePlus,
  },
  {
    id: "voiceover",
    name: "Voiceover",
    tagline: "Draft spoken scripts and narration beats.",
    description: "Voice script builder for reels, tutorials, promos, and explainer content.",
    status: "planned",
    icon: Mic,
  },
  {
    id: "trend-mapper",
    name: "Trend Mapper",
    tagline: "Find trend angles that fit your niche.",
    description: "Maps trending topics to practical post angles and creator actions.",
    status: "planned",
    icon: TrendingUp,
  },
];

const toolStatusLabel: Record<StudioTool["status"], string> = {
  live: "Live",
  next: "Next up",
  planned: "Planned",
};

export default function AIStudioPage() {
  const router = useRouter();
  const userId = useCreatorStore((state) => state.userId);
  const [activeTool, setActiveTool] = useState<StudioToolId>("composer");

  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      content: "Tell me how you want the content to feel, and I’ll turn it into a full post idea.",
    },
  ]);
  const [prompt, setPrompt] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [language, setLanguage] = useState("english");
  const [tone, setTone] = useState("conversational");
  const [audienceLocation, setAudienceLocation] = useState("Nigeria");
  const [loading, setLoading] = useState(false);
  const [brainstormLoading, setBrainstormLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brainstormError, setBrainstormError] = useState<string | null>(null);
  const [result, setResult] = useState<AiComposeResponse | null>(null);
  const [brainstormTopic, setBrainstormTopic] = useState("Weekly content system for creators");
  const [brainstormGoal, setBrainstormGoal] = useState("build personal brand");
  const [brainstormResult, setBrainstormResult] = useState<AiBrainstormResponse | null>(null);

  useEffect(() => {
    if (!userId) router.replace("/auth/login");
  }, [router, userId]);

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

  const handleBrainstormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextTopic = brainstormTopic.trim();
    if (!nextTopic) {
      setBrainstormError("Add a topic so I can generate better angles.");
      return;
    }

    setBrainstormLoading(true);
    setBrainstormError(null);

    try {
      const data = await generateAiBrainstorm({
        user_id: userId,
        topic: nextTopic,
        platform,
        language,
        goal: brainstormGoal,
        tone,
        audience_location: audienceLocation,
      });
      setBrainstormResult(data);
    } catch (err) {
      setBrainstormError(
        getApiErrorMessage(err, "Could not brainstorm ideas right now. Please try again."),
      );
    } finally {
      setBrainstormLoading(false);
    }
  };

  const fallbackTool: StudioTool = studioTools[0] ?? {
    id: "composer",
    name: "Composer",
    tagline: "Talk your way into a full post concept.",
    description: "Conversational writing partner for posts, hooks, structure, and CTA.",
    status: "live",
    icon: Wand2,
  };
  const currentTool: StudioTool =
    studioTools.find((tool) => tool.id === activeTool) ?? fallbackTool;
  const isComposer = activeTool === "composer";
  const isBrainstorm = activeTool === "brainstorm";

  const handleComposerQuickPrompt = async (value: string) => {
    setPrompt(value);
    await submitPrompt(value);
  };

  const handleComposerSend = async () => {
    if (loading) return;
    await submitPrompt(prompt);
  };

  return (
    <MobileShell
      title="AI Studio"
      subtitle="Choose the AI tool you need, then work inside one focused creative workspace."
    >
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="surface-luxe cyber-grid scanline rounded-2xl p-4"
      >
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
          <Sparkles size={12} />
          Creative AI tool shelf
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {studioTools.map((tool) => {
            const Icon = tool.icon;
            const isActive = tool.id === activeTool;

            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => setActiveTool(tool.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  isActive
                    ? "border-violet-400/40 bg-violet-500/12 shadow-[0_0_0_1px_rgba(167,139,250,0.25)]"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-black/20 text-violet-300 light:bg-violet-50 light:text-violet-700">
                    <Icon size={18} />
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                      tool.status === "live"
                        ? "bg-emerald-500/15 text-emerald-300 light:bg-emerald-100 light:text-emerald-700"
                        : tool.status === "next"
                          ? "bg-amber-500/15 text-amber-300 light:bg-amber-100 light:text-amber-700"
                          : "bg-white/10 text-slate-400 light:bg-slate-100 light:text-slate-600"
                    }`}
                  >
                    {toolStatusLabel[tool.status]}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-white light:text-slate-900">
                  {tool.name}
                </h2>
                <p className="mt-1 text-sm text-slate-200 light:text-slate-700">{tool.tagline}</p>
                <p className="mt-2 text-xs leading-5 text-slate-400 light:text-slate-600">
                  {tool.description}
                </p>
              </button>
            );
          })}
        </div>

        <div
          className={`grid gap-4 ${isComposer ? "grid-cols-1" : "lg:grid-cols-[1.05fr_0.95fr]"}`}
        >
          <div className="space-y-3.5">
            <div className="surface-soft rounded-2xl p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Active tool
              </p>
              <h2 className="text-lg font-semibold text-white light:text-slate-900">
                {currentTool.name}
              </h2>
              <p className="mt-1 text-sm text-slate-400 light:text-slate-600">
                {currentTool.description}
              </p>
            </div>

            {!isComposer ? (
              <>
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
              </>
            ) : (
              <div className="surface-soft rounded-2xl p-4 text-sm text-slate-400 light:text-slate-600">
                Composer is now chat-first. Just type naturally and the AI will keep turning your
                conversation into content ideas.
              </div>
            )}

            {isBrainstorm ? (
              <>
                <form onSubmit={(e) => void handleBrainstormSubmit(e)} className="space-y-3.5">
                  <div className="surface-soft rounded-2xl p-4">
                    <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <Lightbulb size={11} /> Topic to expand
                    </label>
                    <textarea
                      value={brainstormTopic}
                      onChange={(e) => setBrainstormTopic(e.target.value)}
                      className="xcr8-input h-28 resize-none"
                      placeholder="Example: weekly content system for creators who want better brand consistency."
                    />
                  </div>

                  <div className="surface-soft rounded-2xl p-4">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Goal
                    </label>
                    <input
                      value={brainstormGoal}
                      onChange={(e) => setBrainstormGoal(e.target.value)}
                      className="xcr8-input"
                      placeholder="Build personal brand, drive engagement, sell an offer..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={brainstormLoading}
                    className="cta-btn inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold disabled:opacity-60"
                  >
                    {brainstormLoading ? "Generating ideas…" : "Generate brainstorm"}
                    {!brainstormLoading ? <ArrowRight size={16} /> : null}
                  </button>

                  {brainstormError ? (
                    <p
                      role="status"
                      className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-400"
                    >
                      {brainstormError}
                    </p>
                  ) : null}
                </form>

                <div className="surface-soft rounded-2xl p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Fast topic starters
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {brainstormPrompts.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setBrainstormTopic(item)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-left text-xs text-slate-300 transition hover:bg-white/10"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {!isComposer && !isBrainstorm ? (
              <div className="surface-soft rounded-2xl p-5">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300 light:border-amber-500/20 light:bg-amber-50 light:text-amber-700">
                  {toolStatusLabel[currentTool.status]}
                </div>
                <h3 className="text-lg font-semibold text-white light:text-slate-900">
                  {currentTool.name} is on the roadmap
                </h3>
                <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
                  We can use this slot for {currentTool.description.toLowerCase()} The shelf is
                  ready, so the next step is wiring the backend action for this tool.
                </p>
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300 light:bg-slate-50 light:text-slate-700">
                  Start with Image Generator, then add Voiceover and Trend Mapper as focused
                  creative tools inside the same studio.
                </div>
              </div>
            ) : null}

            <div className="surface-soft rounded-2xl p-4 text-sm text-slate-400 light:text-slate-600">
              AI Studio works best as a stack of focused tools, not one giant prompt box. Start with
              Composer for chat-first idea generation, Brainstorm for idea batches, then expand into
              visual, voice, and trend workflows.
            </div>
          </div>

          <div className={isComposer ? "space-y-3.5" : "space-y-3.5"}>
            {isComposer ? (
              <>
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
                        onClick={() => void handleComposerQuickPrompt(item)}
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
                            void handleComposerSend();
                          }
                        }}
                        className="xcr8-input h-14 min-h-14 resize-none border-none bg-transparent shadow-none"
                        placeholder="Ask for an idea, angle, hook, or full content direction..."
                      />
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void handleComposerSend()}
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
              </>
            ) : null}

            {isBrainstorm ? (
              brainstormResult ? (
                <article className="surface-card rounded-2xl p-4">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
                    <Lightbulb size={11} />
                    Brainstorm pack
                  </div>
                  <h3 className="text-lg font-semibold text-white light:text-slate-900">
                    {brainstormResult.topic}
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
                    Goal: {brainstormResult.goal} · Platform: {brainstormResult.platform}
                  </p>
                  <div className="mt-4 space-y-3">
                    {brainstormResult.ideas.map((idea, index) => (
                      <div
                        key={`${idea.title}-${index}`}
                        className="rounded-2xl bg-black/20 p-4 light:bg-slate-50"
                      >
                        <h4 className="text-sm font-semibold text-white light:text-slate-900">
                          {idea.title}
                        </h4>
                        <p className="mt-1 text-sm text-slate-300 light:text-slate-700">
                          {idea.angle}
                        </p>
                        <p className="mt-2 text-sm text-slate-200 light:text-slate-800">
                          <span className="font-semibold text-violet-300 light:text-violet-700">
                            Hook:
                          </span>{" "}
                          {idea.hook}
                        </p>
                        <p className="mt-2 text-sm text-slate-200 light:text-slate-800">
                          <span className="font-semibold text-violet-300 light:text-violet-700">
                            Caption seed:
                          </span>{" "}
                          {idea.caption_seed}
                        </p>
                        <p className="mt-2 text-sm text-slate-200 light:text-slate-800">
                          <span className="font-semibold text-violet-300 light:text-violet-700">
                            CTA:
                          </span>{" "}
                          {idea.cta}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {idea.hashtags.map((tag) => (
                            <span
                              key={`${idea.title}-${tag}`}
                              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-400"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    Model: {brainstormResult.model} · {brainstormResult.latency_ms}ms · template{" "}
                    {brainstormResult.prompt_template_version}
                  </div>
                </article>
              ) : (
                <div className="surface-soft rounded-2xl p-4 text-sm text-slate-500 light:text-slate-600">
                  Your brainstorm pack will appear here after you generate ideas.
                </div>
              )
            ) : null}

            {!isComposer && !isBrainstorm ? (
              <div className="surface-soft rounded-2xl p-4 text-sm text-slate-500 light:text-slate-600">
                Select Composer or Brainstorm for live AI output. The other tools already have a
                slot in the studio and can be wired next without redesigning the page.
              </div>
            ) : null}
          </div>
        </div>
      </motion.section>
    </MobileShell>
  );
}
