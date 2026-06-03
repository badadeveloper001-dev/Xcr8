"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Lightbulb } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";
import { generateAiBrainstorm, getApiErrorMessage, type AiBrainstormResponse } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

export default function BrainstormPage() {
  const userId = useCreatorStore((state) => state.userId);
  const [platform, setPlatform] = useState("instagram");
  const [language, setLanguage] = useState("english");
  const [tone, setTone] = useState("conversational");
  const [audienceLocation, setAudienceLocation] = useState("Nigeria");
  const [topic, setTopic] = useState("Weekly content system for creators");
  const [goal, setGoal] = useState("build personal brand");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiBrainstormResponse | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTopic = topic.trim();
    if (!nextTopic) {
      setError("Add a topic so I can generate better angles.");
      return;
    }
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await generateAiBrainstorm({
        user_id: userId,
        topic: nextTopic,
        platform,
        language,
        goal,
        tone,
        audience_location: audienceLocation,
      });
      setResult(data);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not brainstorm ideas right now. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <StudioShell
      title="AI Studio"
      subtitle="Brainstorm ideas."
      activeToolId="brainstorm"
      showToolShelf={false}
    >
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-3.5">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
            <div className="ai-stage p-4">
              <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Lightbulb size={11} /> Topic to expand
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="xcr8-input h-28 resize-none"
                placeholder="Example: weekly content system for creators who want better brand consistency."
              />
            </div>

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

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="xcr8-input"
                placeholder="Goal"
              />
              <select value={tone} onChange={(e) => setTone(e.target.value)} className="xcr8-input">
                {["conversational", "bold", "educational", "funny", "luxury", "motivational"].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <input
              value={audienceLocation}
              onChange={(e) => setAudienceLocation(e.target.value)}
              className="xcr8-input"
              placeholder="Audience location"
            />

            <button
              type="submit"
              disabled={loading}
              className="cta-btn inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold disabled:opacity-60"
            >
              {loading ? "Generating ideas..." : "Generate brainstorm"}
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

        </div>

        <div className="space-y-3.5">
          {result ? (
            <article className="ai-stage p-4">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-300/25 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300 light:border-slate-300/60 light:bg-slate-100 light:text-slate-700">
                <Lightbulb size={11} />
                Idea pack
              </div>
              <h3 className="text-lg font-semibold text-white light:text-slate-900">
                {result.topic}
              </h3>
              <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
                {result.platform}
              </p>
              <div className="mt-4 space-y-3">
                {result.ideas.slice(0, 3).map((idea, index) => (
                  <div
                    key={`${idea.title}-${index}`}
                    className="ai-chat-log rounded-2xl p-4"
                  >
                    <h4 className="text-sm font-semibold text-white light:text-slate-900">
                      {idea.title}
                    </h4>
                    <p className="mt-2 text-sm text-slate-200 light:text-slate-800">
                      <span className="font-semibold text-violet-300 light:text-violet-700">
                        Hook:
                      </span>{" "}
                      {idea.hook}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          ) : (
            <div className="ai-stage p-4 text-sm text-slate-500 light:text-slate-600">
              Ideas appear here.
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
