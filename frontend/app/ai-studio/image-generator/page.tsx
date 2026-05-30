"use client";

import { FormEvent, useMemo, useState } from "react";
import { Copy, ImagePlus, RefreshCw } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";

type ImageConcept = {
  title: string;
  direction: string;
  prompt: string;
};

const styleNotes: Record<string, string> = {
  cinematic: "high-detail cinematic frame, dramatic lighting, depth of field",
  editorial: "clean editorial composition, brand-focused product styling",
  documentary: "natural documentary photography, authentic moment, real-life texture",
  vibrant: "vibrant pop colors, bold contrast, punchy creative direction",
};

const isStyleKey = (value: string): value is keyof typeof styleNotes => value in styleNotes;

export default function ImageGeneratorPage() {
  const [subject, setSubject] = useState("Creator building a weekly content system at a desk");
  const [platform, setPlatform] = useState("instagram");
  const [style, setStyle] = useState<keyof typeof styleNotes>("cinematic");
  const [mood, setMood] = useState("confident and practical");
  const [ratio, setRatio] = useState("4:5");
  const [palette, setPalette] = useState("warm orange, cream, deep charcoal");
  const [concepts, setConcepts] = useState<ImageConcept[]>([]);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

  const canGenerate = subject.trim().length > 4;

  const baseIdeas = useMemo(
    () => ["Hero shot", "Behind-the-scenes", "Step-by-step frame", "CTA cover visual"],
    [],
  );

  const handleStyleChange = (value: string) => {
    if (isStyleKey(value)) {
      setStyle(value);
    }
  };

  const handleGenerate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanSubject = subject.trim();
    if (!cleanSubject) return;

    const built = baseIdeas.map((idea, index) => {
      const direction = `${idea} for ${platform} in a ${mood} mood with ${palette} palette.`;
      const prompt = `${cleanSubject}, ${styleNotes[style]}, ${direction}, aspect ratio ${ratio}, no text overlay, creator economy visual style, high quality`;
      return {
        title: `${idea} ${index + 1}`,
        direction,
        prompt,
      };
    });

    setConcepts(built);
    setCopiedPrompt(null);
  };

  const copyPrompt = async (prompt: string) => {
    await navigator.clipboard.writeText(prompt);
    setCopiedPrompt(prompt);
  };

  return (
    <StudioShell
      title="AI Studio"
      subtitle="Image Generator now has its own workspace for prompt-to-visual concept generation."
      activeToolId="image-generator"
    >
      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={(e) => handleGenerate(e)} className="space-y-3.5">
          <div className="surface-soft rounded-2xl p-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              What should the image show?
            </label>
            <textarea
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="xcr8-input h-28 resize-none"
              placeholder="Example: Founder filming a short-form video in a sunlit office with phone on tripod"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="xcr8-input"
            >
              {["instagram", "linkedin", "tiktok", "youtube_shorts"].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={style}
              onChange={(e) => handleStyleChange(e.target.value)}
              className="xcr8-input"
            >
              {Object.keys(styleNotes).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              className="xcr8-input"
              placeholder="Mood"
            />
            <input
              value={ratio}
              onChange={(e) => setRatio(e.target.value)}
              className="xcr8-input"
              placeholder="Aspect ratio"
            />
          </div>

          <input
            value={palette}
            onChange={(e) => setPalette(e.target.value)}
            className="xcr8-input"
            placeholder="Color palette"
          />

          <button
            type="submit"
            disabled={!canGenerate}
            className="cta-btn inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold disabled:opacity-60"
          >
            <RefreshCw size={16} />
            Generate image concepts
          </button>
        </form>

        <div className="space-y-3.5">
          {concepts.length ? (
            concepts.map((concept) => (
              <article key={concept.title} className="surface-card rounded-2xl p-4">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
                  <ImagePlus size={11} />
                  {concept.title}
                </div>
                <p className="text-sm text-slate-300 light:text-slate-700">{concept.direction}</p>
                <div className="mt-3 rounded-xl bg-black/20 p-3 light:bg-slate-50">
                  <p className="text-xs leading-6 text-slate-200 light:text-slate-800">
                    {concept.prompt}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyPrompt(concept.prompt)}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
                >
                  <Copy size={12} />
                  {copiedPrompt === concept.prompt ? "Copied" : "Copy prompt"}
                </button>
              </article>
            ))
          ) : (
            <div className="surface-soft rounded-2xl p-4 text-sm text-slate-500 light:text-slate-600">
              Generate concepts to get ready-to-use prompts for your preferred image model.
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
