"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, Wand2, MessageSquareQuote, Hash, Target, ArrowRight } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { generateAiBrainstorm, getApiErrorMessage, type AiBrainstormResponse } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

const platformOptions = ["instagram", "tiktok", "x", "linkedin", "threads", "youtube_shorts"];
const languageOptions = ["english", "nigerian_pidgin", "yoruba", "code_switch"];
const goalOptions = [
  "grow audience",
  "increase engagement",
  "monetize content",
  "build personal brand",
  "improve consistency",
];
const toneOptions = ["conversational", "bold", "educational", "funny", "luxury", "motivational"];

export default function AIStudioPage() {
  const router = useRouter();
  const userId = useCreatorStore((state) => state.userId);
  const creatorName = useCreatorStore((state) => state.fullName) ?? useCreatorStore((state) => state.displayName) ?? "Creator";

  const [topic, setTopic] = useState("creator consistency routines");
  const [platform, setPlatform] = useState("instagram");
  const [language, setLanguage] = useState("english");
  const [goal, setGoal] = useState("grow audience");
  const [tone, setTone] = useState("conversational");
  const [audienceLocation, setAudienceLocation] = useState("Nigeria");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiBrainstormResponse | null>(null);

  useEffect(() => {
    if (!userId) router.replace("/auth/login");
  }, [router, userId]);

  if (!userId) return null;

  const runBrainstorm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!topic.trim()) {
      setError("Add a topic or angle first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await generateAiBrainstorm({
        user_id: userId,
        topic,
        platform,
        language,
        goal,
        tone,
        audience_location: audienceLocation,
      });
      setResult(data);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not generate ideas right now. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <MobileShell title="AI Studio" subtitle="Brainstorm ideas, hooks, and campaign angles." >
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="surface-luxe cyber-grid scanline rounded-2xl p-4"
      >
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
          <Sparkles size={12} />
          AI-native creator tooling
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <form onSubmit={(e) => void runBrainstorm(e)} className="space-y-3.5">
            <div className="surface-soft rounded-2xl p-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Topic / angle
              </label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="xcr8-input"
                placeholder="e.g. creator consistency routines"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Hello {creatorName}, this is where you turn one topic into three usable ideas.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="surface-soft rounded-2xl p-4">
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Target size={11} /> Platform
                </label>
                <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="xcr8-input">
                  {platformOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <div className="surface-soft rounded-2xl p-4">
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Hash size={11} /> Language
                </label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="xcr8-input">
                  {languageOptions.map((item) => (
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
                  Goal
                </label>
                <select value={goal} onChange={(e) => setGoal(e.target.value)} className="xcr8-input">
                  {goalOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <div className="surface-soft rounded-2xl p-4">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tone
                </label>
                <select value={tone} onChange={(e) => setTone(e.target.value)} className="xcr8-input">
                  {toneOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="surface-soft rounded-2xl p-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Audience location
              </label>
              <input
                value={audienceLocation}
                onChange={(e) => setAudienceLocation(e.target.value)}
                className="xcr8-input"
                placeholder="e.g. Nigeria, UK, Global"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="cta-btn inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold disabled:opacity-60"
            >
              {loading ? "Brainstorming…" : "Generate AI Ideas"}
              {!loading ? <ArrowRight size={16} /> : null}
            </button>

            {error ? (
              <p role="status" className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
                {error}
              </p>
            ) : null}
          </form>

          <div className="space-y-3.5">
            <div className="surface-soft rounded-2xl p-4">
              <h2 className="mb-1.5 flex items-center gap-2 text-base font-semibold text-white light:text-slate-900">
                <Wand2 size={16} className="text-violet-400" />
                What you get
              </h2>
              <ul className="space-y-2 text-sm text-slate-400 light:text-slate-600">
                <li>Three distinct angles so your content doesn’t repeat itself.</li>
                <li>Hooks, caption seeds, CTAs, and hashtags in one pass.</li>
                <li>Ideas shaped by your creator memory when available.</li>
              </ul>
            </div>

            {result ? (
              <div className="space-y-3.5">
                <div className="surface-soft rounded-2xl p-4 text-xs text-slate-500">
                  Model: {result.model} · {result.latency_ms}ms · template {result.prompt_template_version}
                </div>
                {result.ideas.map((idea, index) => (
                  <article key={`${idea.title}-${index}`} className="surface-card rounded-2xl p-4">
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
                      <MessageSquareQuote size={11} />
                      Idea {index + 1}
                    </div>
                    <h3 className="text-lg font-semibold text-white light:text-slate-900">{idea.title}</h3>
                    <p className="mt-2 text-sm text-slate-400 light:text-slate-600">{idea.angle}</p>
                    <div className="mt-3 space-y-2 rounded-xl bg-black/20 p-3 light:bg-slate-50">
                      <p className="text-sm text-slate-200 light:text-slate-800">
                        <span className="font-semibold text-violet-300 light:text-violet-700">Hook:</span> {idea.hook}
                      </p>
                      <p className="text-sm text-slate-200 light:text-slate-800">
                        <span className="font-semibold text-violet-300 light:text-violet-700">Caption seed:</span> {idea.caption_seed}
                      </p>
                      <p className="text-sm text-slate-200 light:text-slate-800">
                        <span className="font-semibold text-violet-300 light:text-violet-700">CTA:</span> {idea.cta}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {idea.hashtags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="surface-soft rounded-2xl p-4 text-sm text-slate-500 light:text-slate-600">
                Generate ideas to see the brainstorm output here.
              </div>
            )}
          </div>
        </div>
      </motion.section>
    </MobileShell>
  );
}
