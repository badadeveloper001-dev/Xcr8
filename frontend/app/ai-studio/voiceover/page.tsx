"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Mic, Play, SendHorizontal, Square, Sparkles } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";
import { generateAiVoiceover, getApiErrorMessage, type AiVoiceoverResponse } from "@/lib/api";
import { useCreatorStore } from "@/lib/store";

const platformOptions = ["instagram", "tiktok", "youtube_shorts", "threads", "linkedin", "x"];
const languageOptions = ["english", "nigerian_pidgin", "yoruba", "code_switch"];
const toneOptions = ["conversational", "bold", "educational", "cinematic", "warm", "persuasive"];
const paceOptions = ["steady", "fast", "slow", "punchy"];
const voiceOptions = ["warm", "confident", "calm", "high-energy", "premium"];
const durationOptions = [30, 45, 60, 90, 120];

export default function VoiceoverPage() {
  const userId = useCreatorStore((state) => state.userId);
  const displayName = useCreatorStore((state) => state.displayName);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const defaultPrompt = useMemo(
    () =>
      displayName
        ? `Write a spoken voiceover for ${displayName}'s next creator post about consistency.`
        : "Write a spoken voiceover for my next creator post about consistency.",
    [displayName],
  );

  const [topic, setTopic] = useState(defaultPrompt);
  const [platform, setPlatform] = useState("instagram");
  const [language, setLanguage] = useState("english");
  const [tone, setTone] = useState("conversational");
  const [goal, setGoal] = useState("engage viewers");
  const [audienceLocation, setAudienceLocation] = useState("Nigeria");
  const [durationSeconds, setDurationSeconds] = useState(60);
  const [pace, setPace] = useState("steady");
  const [voiceStyle, setVoiceStyle] = useState("warm");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiVoiceoverResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const stopPlayback = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    speechRef.current = null;
    setIsSpeaking(false);
  };

  const speakVoiceover = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoiceError("Your browser does not support speech playback.");
      return;
    }
    if (!result) {
      setVoiceError("Generate a voiceover first.");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(
      [result.hook, result.voiceover_script, result.cta].filter(Boolean).join(" "),
    );
    utterance.lang =
      {
        english: "en-US",
        nigerian_pidgin: "en-NG",
        yoruba: "yo-NG",
        code_switch: "en-NG",
      }[result.language] ?? "en-US";
    utterance.rate =
      {
        fast: 1.12,
        steady: 1,
        slow: 0.88,
        punchy: 1.08,
      }[pace] ?? 1;
    utterance.pitch =
      {
        warm: 1,
        confident: 0.92,
        calm: 0.86,
        "high-energy": 1.12,
        premium: 0.95,
      }[voiceStyle] ?? 1;
    utterance.volume = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      speechRef.current = null;
      setIsSpeaking(false);
    };
    utterance.onerror = () => {
      speechRef.current = null;
      setIsSpeaking(false);
      setVoiceError("Could not start voice playback.");
    };

    speechRef.current = utterance;
    setVoiceError(null);
    window.speechSynthesis.speak(utterance);
  };

  const generateVoiceover = async () => {
    const nextTopic = topic.trim();
    if (!nextTopic) {
      setError("Write a topic or prompt for the voiceover.");
      return;
    }
    if (!userId) {
      setError("Your session is missing. Please log in again to use Voiceover.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await generateAiVoiceover({
        user_id: userId,
        topic: nextTopic,
        platform,
        language,
        tone,
        audience_location: audienceLocation,
        goal,
        duration_seconds: durationSeconds,
        pace,
        voice_style: voiceStyle,
      });
      setResult(data);
    } catch (err) {
      setError(
        getApiErrorMessage(err, "Could not generate your voiceover right now. Please try again."),
      );
    } finally {
      setLoading(false);
    }
  };

  const copyScript = async () => {
    if (!result) {
      return;
    }
    await navigator.clipboard.writeText(result.voiceover_script);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  return (
    <StudioShell
      title="AI Studio"
      subtitle="Draft spoken scripts and narration beats for reels, tutorials, and promos."
      activeToolId="voiceover"
      showToolShelf={false}
    >
      <div className="grid gap-4 lg:grid-cols-[0.98fr_1.02fr]">
        <section className="space-y-3.5">
          <div className="ai-stage p-4">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
              <Sparkles size={12} />
              Live tool
            </div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white light:text-slate-900">
              <Mic size={17} className="text-violet-300" />
              Voiceover Script Writer
            </h2>
            <p className="mt-2 text-sm text-slate-400 light:text-slate-600">
              Turn a topic into a spoken script with pacing notes, alternative openers, and a clean
              CTA.
            </p>
          </div>

          <div className="ai-stage p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Prompt
            </p>
            <textarea
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="xcr8-input min-h-28 resize-y border-none bg-white/5 shadow-none light:bg-white/80"
              placeholder="Describe the topic, message, or story you want spoken out loud..."
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="xcr8-input"
              >
                {platformOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
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
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <select value={tone} onChange={(e) => setTone(e.target.value)} className="xcr8-input">
                {toneOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(Number(e.target.value))}
                className="xcr8-input"
              >
                {durationOptions.map((item) => (
                  <option key={item} value={item}>
                    {item} seconds
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <select value={pace} onChange={(e) => setPace(e.target.value)} className="xcr8-input">
                {paceOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                value={voiceStyle}
                onChange={(e) => setVoiceStyle(e.target.value)}
                className="xcr8-input"
              >
                {voiceOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                value={audienceLocation}
                onChange={(e) => setAudienceLocation(e.target.value)}
                className="xcr8-input"
                placeholder="Audience location"
              />
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="xcr8-input"
                placeholder="Goal"
              />
            </div>
            <button
              type="button"
              onClick={() => void generateVoiceover()}
              disabled={loading}
              className="cta-btn mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              <SendHorizontal size={15} />
              {loading ? "Generating..." : "Generate voiceover"}
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

        <section className="space-y-3.5">
          {result ? (
            <>
              <article className="ai-stage p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-300 light:text-violet-700">
                      Generated script
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-white light:text-slate-900">
                      {result.script_title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyScript()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white/70 light:text-slate-700"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? "Copied" : "Copy script"}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={speakVoiceover}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/15 light:border-cyan-300 light:bg-cyan-50 light:text-cyan-700"
                    disabled={!result}
                  >
                    <Play size={13} />
                    Play voice
                  </button>
                  <button
                    type="button"
                    onClick={stopPlayback}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white/70 light:text-slate-700"
                    disabled={!isSpeaking}
                  >
                    <Square size={13} />
                    Stop
                  </button>
                  <p className="text-xs text-slate-500">
                    {isSpeaking ? "Speaking aloud in your browser." : "Ready to play as audio."}
                  </p>
                </div>
                <p className="mt-3 text-sm text-slate-400 light:text-slate-600">{result.hook}</p>
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 light:border-slate-200 light:bg-slate-50">
                  <p className="whitespace-pre-wrap text-sm leading-7 text-slate-100 light:text-slate-800">
                    {result.voiceover_script}
                  </p>
                </div>
              </article>

              <article className="ai-stage p-4">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Beat breakdown
                </h4>
                <div className="mt-3 space-y-2">
                  {result.beat_breakdown.map((item) => (
                    <div
                      key={item}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 light:border-slate-200 light:bg-white/70 light:text-slate-700"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              <div className="grid gap-3 md:grid-cols-2">
                <article className="ai-stage p-4">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Delivery notes
                  </h4>
                  <ul className="mt-3 space-y-2 text-sm text-slate-300 light:text-slate-700">
                    {result.delivery_notes.map((item) => (
                      <li
                        key={item}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 light:border-slate-200 light:bg-white/70"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>

                <article className="ai-stage p-4">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Alternatives
                  </h4>
                  <div className="mt-3 space-y-2 text-sm text-slate-300 light:text-slate-700">
                    {result.alt_openers.map((item) => (
                      <div
                        key={item}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 light:border-slate-200 light:bg-white/70"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <article className="ai-stage p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">CTA</p>
                <p className="mt-2 text-sm text-slate-300 light:text-slate-700">{result.cta}</p>
                <p className="mt-3 text-xs text-slate-500">
                  Estimated duration: {result.estimated_duration_seconds}s · Style:{" "}
                  {result.voice_style} · Pace: {pace}
                </p>
              </article>
            </>
          ) : (
            <div className="ai-stage p-4 text-sm text-slate-500 light:text-slate-600">
              Your script preview appears here.
            </div>
          )}

          {voiceError ? (
            <p
              role="status"
              className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-400"
            >
              {voiceError}
            </p>
          ) : null}
        </section>
      </div>
    </StudioShell>
  );
}
