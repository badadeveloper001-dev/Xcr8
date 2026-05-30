"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Download, ImagePlus, RefreshCw } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";

type GeneratedImage = {
  id: string;
  title: string;
  src: string;
  downloadName: string;
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

export default function ImageGeneratorPage() {
  const [subject, setSubject] = useState("Creator building a weekly content system at a desk");
  const [style, setStyle] = useState<keyof typeof styleNotes>("cinematic");
  const [mood, setMood] = useState("confident and practical");
  const [ratio, setRatio] = useState("4:5");
  const [palette, setPalette] = useState("warm orange, cream, deep charcoal");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = subject.trim().length > 4;

  const baseIdeas = useMemo(
    () => ["Hero shot", "Behind-the-scenes", "Step-by-step frame", "CTA cover visual"],
    [],
  );

  useEffect(() => {
    return () => {
      for (const image of images) {
        URL.revokeObjectURL(image.src);
      }
    };
  }, [images]);

  const handleStyleChange = (value: string) => {
    if (isStyleKey(value)) {
      setStyle(value);
    }
  };

  const resolveImageBlobUrl = async (
    prompt: string,
    width: number,
    height: number,
    seed: number,
  ): Promise<string> => {
    const params = new URLSearchParams({
      prompt,
      width: String(width),
      height: String(height),
      seed: String(seed),
    });

    const response = await fetch(`/api/image/generate?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("generation_failed");
    }

    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) {
      throw new Error("invalid_blob");
    }
    return URL.createObjectURL(blob);
  };

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanSubject = subject.trim();
    if (!cleanSubject) return;

    setGenerating(true);
    setError(null);

    for (const image of images) {
      URL.revokeObjectURL(image.src);
    }
    setImages([]);

    const dimensions =
      ratio === "1:1"
        ? { width: 1024, height: 1024 }
        : ratio === "16:9"
          ? { width: 1344, height: 768 }
          : { width: 1024, height: 1280 };

    const settled = await Promise.allSettled(
      baseIdeas.map(async (idea, index) => {
        const direction = `${idea} in a ${mood} mood with ${palette} palette`;
        const prompt = `${cleanSubject}, ${ultraRealismDirectives}, ${styleNotes[style]}, ${direction}, aspect ratio ${ratio}, no text overlay, realistic skin, realistic hands, realistic reflections`;
        const seed = Date.now() + index * 37;
        const src = await resolveImageBlobUrl(prompt, dimensions.width, dimensions.height, seed);

        return {
          id: `${seed}-${index}`,
          title: `${idea} ${index + 1}`,
          src,
          downloadName: `xcr8-${style}-${ratio.replace(":", "x")}-${index + 1}.png`,
        };
      }),
    );

    const built = settled
      .filter((item): item is PromiseFulfilledResult<GeneratedImage> => item.status === "fulfilled")
      .map((item) => item.value);

    if (built.length === 0) {
      setError("Could not generate images right now. Please try again.");
    } else {
      setImages(built);
      if (built.length < baseIdeas.length) {
        setError(
          `Generated ${built.length} of ${baseIdeas.length} images. Please regenerate for more.`,
        );
      }
    }

    setGenerating(false);
  };

  const handleImageDownload = (src: string, fileName: string) => {
    const anchor = document.createElement("a");
    anchor.href = src;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const handleRatioChange = (value: string) => {
    if (value === "4:5" || value === "1:1" || value === "16:9") {
      setRatio(value);
    }
  };

  return (
    <StudioShell
      title="AI Studio"
      subtitle="Image Generator now creates fresh ultrarealistic images from your prompt."
      activeToolId="image-generator"
      showToolShelf={false}
    >
      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={(e) => void handleGenerate(e)} className="space-y-3.5">
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
            <select
              value={ratio}
              onChange={(e) => handleRatioChange(e.target.value)}
              className="xcr8-input"
            >
              {["4:5", "1:1", "16:9"].map((item) => (
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
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
              className="xcr8-input"
              placeholder="Color palette"
            />
          </div>

          <button
            type="submit"
            disabled={!canGenerate || generating}
            className="cta-btn inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold disabled:opacity-60"
          >
            <RefreshCw size={16} />
            {generating ? "Generating images..." : "Generate images"}
          </button>

          {error ? (
            <p
              role="status"
              className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-400"
            >
              {error}
            </p>
          ) : null}

          <p className="text-xs text-slate-500">
            Ultrarealistic mode is always enabled. Generated images are loaded as downloadable files
            to reduce broken renders.
          </p>
        </form>

        <div className="space-y-3.5">
          {images.length ? (
            images.map((image) => (
              <article key={image.id} className="surface-card rounded-2xl p-4">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300 light:border-violet-500/20 light:bg-violet-50 light:text-violet-700">
                  <ImagePlus size={11} />
                  {image.title}
                </div>

                <img
                  src={image.src}
                  alt={image.title}
                  loading="lazy"
                  className="h-auto w-full rounded-xl border border-white/10 bg-black/20 object-cover"
                />

                <button
                  type="button"
                  onClick={() => handleImageDownload(image.src, image.downloadName)}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
                >
                  <Download size={12} />
                  Download image
                </button>
              </article>
            ))
          ) : (
            <div className="surface-soft rounded-2xl p-4 text-sm text-slate-500 light:text-slate-600">
              Generated images will appear here with one-click download.
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
