"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Mic, SendHorizontal, Sparkles } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";
import { generateAiVoiceoverAudio, getApiErrorMessage } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

const platformOptions = ["instagram", "tiktok", "youtube_shorts", "threads", "linkedin", "x"];
const languageOptions = ["english", "nigerian_pidgin", "yoruba", "code_switch"];
const toneOptions = ["conversational", "bold", "educational", "cinematic", "warm", "persuasive"];
const paceOptions = ["steady", "fast", "slow", "punchy"];
const voiceStyleOptions = ["warm", "confident", "calm", "high-energy", "premium"];
const voiceTypeOptions = ["nova", "alloy", "echo", "fable", "onyx", "shimmer"];
const durationOptions = [30, 45, 60, 90, 120];

export default function VoiceoverPage() {
  const userId = useCreatorStore((state) => state.userId);
  const displayName = useCreatorStore((state) => state.displayName);

  const defaultPrompt = useMemo(
    () =>
      displayName
        ? `Consistency compounds. ${displayName} keeps showing up, learning fast, and building real momentum.`
        : "Consistency compounds. I keep showing up, learning fast, and building real momentum.",
    [displayName],
  );

  const [topic, setTopic] = useState(defaultPrompt);
  const [voiceType, setVoiceType] = useState("nova");
  const [pace, setPace] = useState("steady");
  const [language, setLanguage] = useState("english");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioName, setAudioName] = useState("xcr8-voiceover.mp3");

  const [platform, setPlatform] = useState("instagram");
  const [tone, setTone] = useState("conversational");
  const [goal, setGoal] = useState("engage viewers");
  const [durationSeconds, setDurationSeconds] = useState(60);
  const [voiceStyle, setVoiceStyle] = useState("warm");

  const generateAudio = async () => {
    const nextTopic = topic.trim();
    if (!nextTopic) {
      setError("Write a topic or brief for the voiceover audio.");
      return;
    }
    if (!userId) {
      setError("Your session is missing. Please log in again.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const audioBlob = await generateAiVoiceoverAudio({
        user_id: userId,
        text: nextTopic,
        language,
        pace,
        voice_style: voiceStyle,
        voice_type: voiceType,
        platform,
        tone,
        goal,
        duration_seconds: durationSeconds,
      });

      setAudioUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return URL.createObjectURL(audioBlob);
      });

      const slug = nextTopic
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
      setAudioName(`${slug || "xcr8-voiceover"}.mp3`);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not generate audio right now. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const downloadAudio = () => {
    if (!audioUrl) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = audioUrl;
    anchor.download = audioName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  return (
    <StudioShell
      title="AI Studio"
      subtitle="Paste the exact text you want spoken, choose a voice type, then play or download."
      activeToolId="voiceover"
      showToolShelf={false}
    >
      <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="space-y-3">
          <div className="ai-stage p-4">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
              <Sparkles size={12} />
              Audio only
            </div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white light:text-slate-900">
              <Mic size={17} className="text-violet-300" />
              Voiceover Generator
            </h2>
            <p className="mt-1 text-sm text-slate-400 light:text-slate-600">
              Enter the exact text to speak, pick a voice type, and generate an MP3.
            </p>
          </div>

          <div className="ai-stage p-4">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Voice text
            </label>
            <textarea
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="xcr8-input min-h-28 resize-y"
              placeholder="Type the exact words you want in the final audio..."
            />

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <select
                value={voiceType}
                onChange={(event) => setVoiceType(event.target.value)}
                className="xcr8-input"
              >
                {voiceTypeOptions.map((item) => (
                  <option key={item} value={item}>
                    Voice type: {item}
                  </option>
                ))}
              </select>
              <select
                value={pace}
                onChange={(event) => setPace(event.target.value)}
                className="xcr8-input"
              >
                {paceOptions.map((item) => (
                  <option key={item} value={item}>
                    Pace: {item}
                  </option>
                ))}
              </select>
            </div>

            <details className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 light:border-slate-200 light:bg-white/70">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
                Advanced options
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className="xcr8-input"
                >
                  {languageOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <select
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value)}
                  className="xcr8-input"
                >
                  {platformOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <select
                  value={tone}
                  onChange={(event) => setTone(event.target.value)}
                  className="xcr8-input"
                >
                  {toneOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <select
                  value={durationSeconds}
                  onChange={(event) => setDurationSeconds(Number(event.target.value))}
                  className="xcr8-input"
                >
                  {durationOptions.map((item) => (
                    <option key={item} value={item}>
                      {item} seconds
                    </option>
                  ))}
                </select>
                <select
                  value={voiceStyle}
                  onChange={(event) => setVoiceStyle(event.target.value)}
                  className="xcr8-input sm:col-span-2"
                >
                  {voiceStyleOptions.map((item) => (
                    <option key={item} value={item}>
                      Voice style: {item}
                    </option>
                  ))}
                </select>
                <input
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  className="xcr8-input sm:col-span-2"
                  placeholder="Goal"
                />
              </div>
            </details>

            <button
              type="button"
              onClick={() => void generateAudio()}
              disabled={loading}
              className="cta-btn mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              <SendHorizontal size={15} />
              {loading ? "Generating audio..." : "Generate audio"}
            </button>

            {error ? (
              <p
                role="status"
                className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-400"
              >
                {error}
              </p>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          <div className="ai-stage p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Output</p>
            {audioUrl ? (
              <div className="mt-3 space-y-3">
                <audio controls src={audioUrl} className="w-full" />
                <button
                  type="button"
                  onClick={downloadAudio}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white/70 light:text-slate-700"
                >
                  <Download size={13} />
                  Download MP3
                </button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500 light:text-slate-600">
                Generated audio will appear here. No script or text output is shown.
              </p>
            )}
          </div>
        </section>
      </div>
    </StudioShell>
  );
}
