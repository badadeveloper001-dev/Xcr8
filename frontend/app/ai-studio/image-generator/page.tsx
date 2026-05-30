"use client";

import { FormEvent, useMemo, useState } from "react";
import { Copy, ImagePlus, RefreshCw } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";

type GeneratedImage = {
  title: string;
  prompt: string;
  imageUrls: string[];
  imageIndex: number;
};

const styleNotes: Record<string, string> = {
  cinematic: "cinematic composition, dramatic natural lighting, rich depth of field",
  editorial: "editorial photography style, premium brand framing, clean composition",
  documentary: "documentary realism, authentic moment, natural skin texture",
  vibrant: "vibrant color grading with realistic materials and lifelike lighting",
};

const ultraRealismDirectives =
  "ultrarealistic photo, photorealistic, real human skin texture, natural shadows, DSLR quality, 85mm lens look, high dynamic range, detailed lighting";

const isStyleKey = (value: string): value is keyof typeof styleNotes => value in styleNotes;

function buildCandidateUrls(
  prompt: string,
  width: number,
  height: number,
  baseSeed: number,
): string[] {
  const encodedPrompt = encodeURIComponent(prompt);
  const fluxPrimary = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=${width}&height=${height}&seed=${baseSeed}&nologo=true&enhance=true`;
  const fluxFallback = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=${width}&height=${height}&seed=${baseSeed + 97}&nologo=true&enhance=true`;
  const turboFallback = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=turbo&width=${width}&height=${height}&seed=${baseSeed + 211}&nologo=true`;
  return [fluxPrimary, fluxFallback, turboFallback];
}

export default function ImageGeneratorPage() {
  const [subject, setSubject] = useState("Creator building a weekly content system at a desk");
  const [platform, setPlatform] = useState("instagram");
  const [style, setStyle] = useState<keyof typeof styleNotes>("cinematic");
  const [mood, setMood] = useState("confident and practical");
  const [ratio, setRatio] = useState("4:5");
  const [palette, setPalette] = useState("warm orange, cream, deep charcoal");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [generating, setGenerating] = useState(false);
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

    setGenerating(true);

    const dimensions =
      ratio === "1:1"
        ? { width: 1024, height: 1024 }
        : ratio === "16:9"
          ? { width: 1344, height: 768 }
          : { width: 1024, height: 1280 };

    const built = baseIdeas.map((idea, index) => {
      const direction = `${idea} for ${platform} in a ${mood} mood with ${palette} palette`;
      const prompt = `${cleanSubject}, ${ultraRealismDirectives}, ${styleNotes[style]}, ${direction}, aspect ratio ${ratio}, no text overlay, creator economy visual style, realistic skin, realistic hands, realistic reflections`;
      const seed = Date.now() + index * 37;

      return {
        title: `${idea} ${index + 1}`,
        prompt,
        imageUrls: buildCandidateUrls(prompt, dimensions.width, dimensions.height, seed),
        imageIndex: 0,
      };
    });

    setImages(built);
    setCopiedPrompt(null);
    setGenerating(false);
  };

  const copyPrompt = async (prompt: string) => {
    await navigator.clipboard.writeText(prompt);
    setCopiedPrompt(prompt);
  };

  const handleImageError = (index: number) => {
    setImages((current) => {
      const next = [...current];
      const target = next[index];
      if (!target) return current;
      if (target.imageIndex < target.imageUrls.length - 1) {
        next[index] = { ...target, imageIndex: target.imageIndex + 1 };
      }
      return next;
    });
  };

  return (
    <StudioShell
      title="AI Studio"
      subtitle="Image Generator now creates fresh ultrarealistic images from your prompt."
      activeToolId="image-generator"
      showToolShelf={false}
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
              placeholder="Aspect ratio (e.g. 4:5, 1:1, 16:9)"
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
            disabled={!canGenerate || generating}
            className="cta-btn inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold disabled:opacity-60"
          >
            <RefreshCw size={16} />
            {generating ? "Generating images..." : "Generate real images"}
          </button>

          <p className="text-xs text-slate-500">
            Every output is forced toward ultrarealistic photography. If an image URL fails, the app
            automatically falls back to alternate generation URLs.
          </p>
        </form>

        <div className="space-y-3.5">
          {images.length ? (
            images.map((image, index) => (
              <article key={image.title} className="surface-card rounded-2xl p-4">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
                  <ImagePlus size={11} />
                  {image.title}
                </div>

                <img
                  src={image.imageUrls[image.imageIndex]}
                  alt={image.prompt}
                  loading="lazy"
                  onError={() => handleImageError(index)}
                  className="h-auto w-full rounded-xl border border-white/10 bg-black/20 object-cover"
                />

                <div className="mt-3 rounded-xl bg-black/20 p-3 light:bg-slate-50">
                  <p className="text-xs leading-6 text-slate-200 light:text-slate-800">
                    {image.prompt}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyPrompt(image.prompt)}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
                >
                  <Copy size={12} />
                  {copiedPrompt === image.prompt ? "Copied" : "Copy prompt"}
                </button>
              </article>
            ))
          ) : (
            <div className="surface-soft rounded-2xl p-4 text-sm text-slate-500 light:text-slate-600">
              Generate images to see real visual outputs from your prompt instantly.
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
