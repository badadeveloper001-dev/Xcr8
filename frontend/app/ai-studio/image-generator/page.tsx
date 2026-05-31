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

type RealismLevel = "balanced" | "realistic" | "ultra";
type CameraAngle = "eye-level" | "low-angle" | "overhead" | "close-up";
type LightingStyle = "soft daylight" | "golden hour" | "studio key light" | "neon night";
type UseCase = "ad-creative" | "product-still" | "portrait" | "thumbnail" | "sports-action";

type GenerationPreset = {
  id: string;
  label: string;
  subject: string;
  style: keyof typeof styleNotes;
  ratio: "4:5" | "1:1" | "16:9";
  mood: string;
  palette: string;
  camera: CameraAngle;
  lighting: LightingStyle;
};

const styleNotes: Record<string, string> = {
  cinematic: "cinematic composition, dramatic natural lighting, rich depth of field",
  editorial: "editorial photography style, premium brand framing, clean composition",
  documentary: "documentary realism, authentic moment, natural skin texture",
  vibrant: "vibrant color grading with realistic materials and lifelike lighting",
};

const realismDirectives: Record<RealismLevel, string> = {
  balanced:
    "real-world photography, natural lighting, realistic materials, believable skin texture, sharp focus",
  realistic:
    "photorealistic image, DSLR-grade detail, natural skin pores, physically plausible shadows, accurate reflections",
  ultra:
    "ultrarealistic photo, photorealistic, real human skin texture, natural shadows, realistic hands, realistic reflections, DSLR quality, 85mm lens look, cinematic color science, high dynamic range, physically accurate lighting, high detail",
};

const realismAttempts: Record<RealismLevel, number> = {
  balanced: 2,
  realistic: 3,
  ultra: 4,
};

const useCaseDirectives: Record<UseCase, string> = {
  "ad-creative":
    "premium ad creative, conversion-focused composition, clean negative space, visual hierarchy",
  "product-still":
    "hero product shot, clean backdrop, precise material rendering, realistic micro-texture detail",
  portrait:
    "editorial portrait photography, natural face proportions, clean skin texture, realistic eyes and hands",
  thumbnail:
    "high-clarity thumbnail image, strong subject separation, bold readable composition, high contrast",
  "sports-action":
    "elite sports action photography, one athlete in dynamic motion, exactly one football in frame, realistic ball movement, crisp limbs, freeze-frame intensity",
};

const useCaseRatios: Record<UseCase, "4:5" | "1:1" | "16:9"> = {
  "ad-creative": "4:5",
  "product-still": "1:1",
  portrait: "4:5",
  thumbnail: "16:9",
  "sports-action": "16:9",
};

const cleanPhotorealismDirective =
  "tack-sharp focus, crisp edges, clean details, natural geometry, accurate anatomy, no visual artifacts";

const qualityNegativeDirectives =
  "blurry, soft focus, low resolution, noisy image, jpeg artifacts, cartoon, painting, illustration, cgi, wax skin, deformed face, extra fingers, extra limbs, duplicate people, asymmetrical eyes, broken teeth, distorted anatomy, text overlay, watermark, logo";

const variationLabels = ["Hero", "Alternative A", "Alternative B"] as const;
const variationDirections = [
  "hero framing, premium composition",
  "alternative framing, changed angle",
  "alternative framing, changed spacing",
] as const;

const generationPresets: readonly GenerationPreset[] = [
  {
    id: "creator-workspace",
    label: "Creator Workspace",
    subject: "Creator building a weekly content system at a desk",
    style: "cinematic",
    ratio: "4:5",
    mood: "confident and practical",
    palette: "warm neutrals, muted violet accents, deep charcoal",
    camera: "eye-level",
    lighting: "soft daylight",
  },
  {
    id: "product-launch",
    label: "Product Launch",
    subject: "Premium skincare product on a modern vanity with subtle reflections",
    style: "editorial",
    ratio: "1:1",
    mood: "clean and aspirational",
    palette: "cream, rose beige, satin silver",
    camera: "close-up",
    lighting: "studio key light",
  },
  {
    id: "ugc-lifestyle",
    label: "UGC Lifestyle",
    subject: "Young creator recording a short testimonial with a phone in a bright apartment",
    style: "documentary",
    ratio: "4:5",
    mood: "authentic and upbeat",
    palette: "natural skin tones, soft blue, warm wood",
    camera: "eye-level",
    lighting: "golden hour",
  },
  {
    id: "brand-hero",
    label: "Brand Hero Banner",
    subject: "High-end fashion founder in a modern studio with strong silhouettes",
    style: "vibrant",
    ratio: "16:9",
    mood: "bold and premium",
    palette: "midnight navy, electric cyan, soft magenta",
    camera: "low-angle",
    lighting: "neon night",
  },
];

const isStyleKey = (value: string): value is keyof typeof styleNotes => value in styleNotes;

const cleanText = (value: string) => value.trim().replace(/\s+/g, " ");
const defaultPreset = generationPresets[0]!;

export default function ImageGeneratorPage() {
  const [subject, setSubject] = useState(defaultPreset.subject);
  const [style, setStyle] = useState<keyof typeof styleNotes>(defaultPreset.style);
  const [mood, setMood] = useState(defaultPreset.mood);
  const [ratio, setRatio] = useState(defaultPreset.ratio);
  const [palette, setPalette] = useState(defaultPreset.palette);
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>(defaultPreset.camera);
  const [lightingStyle, setLightingStyle] = useState<LightingStyle>(defaultPreset.lighting);
  const [useCase, setUseCase] = useState<UseCase>("ad-creative");
  const [realism, setRealism] = useState<RealismLevel>("ultra");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [promptPreview, setPromptPreview] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [regeneratingImageId, setRegeneratingImageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = subject.trim().length > 4;

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
    attempts: number,
  ): Promise<string> => {
    const params = new URLSearchParams({
      prompt,
      width: String(width),
      height: String(height),
      seed: String(seed),
      attempts: String(attempts),
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

  const getDimensions = (nextRatio: string, nextRealism: RealismLevel) => {
    if (nextRatio === "1:1") {
      return nextRealism === "ultra"
        ? { width: 1536, height: 1536 }
        : { width: 1280, height: 1280 };
    }

    if (nextRatio === "16:9") {
      return nextRealism === "ultra" ? { width: 1920, height: 1080 } : { width: 1536, height: 864 };
    }

    return nextRealism === "ultra" ? { width: 1536, height: 1920 } : { width: 1280, height: 1600 };
  };

  const buildPrompt = (
    cleanSubject: string,
    cleanMood: string,
    cleanPalette: string,
    direction: string,
  ) =>
    [
      `high-end commercial photography of ${cleanSubject}`,
      realismDirectives[realism],
      cleanPhotorealismDirective,
      useCaseDirectives[useCase],
      styleNotes[style],
      `subject mood ${cleanMood}`,
      `color palette ${cleanPalette}`,
      `camera angle ${cameraAngle}`,
      `lighting ${lightingStyle}`,
      `aspect ratio ${ratio}`,
      direction,
      "no text overlay",
      qualityNegativeDirectives,
    ].join(", ");

  const generateVariation = async (
    label: string,
    index: number,
    cleanSubject: string,
    cleanMood: string,
    cleanPalette: string,
  ): Promise<GeneratedImage> => {
    const direction = variationDirections[index] ?? "alternative framing";
    const prompt = buildPrompt(cleanSubject, cleanMood, cleanPalette, direction);
    const dimensions = getDimensions(ratio, realism);
    const seed = Date.now() + index * 97;
    const src = await resolveImageBlobUrl(
      prompt,
      dimensions.width,
      dimensions.height,
      seed,
      realismAttempts[realism],
    );

    return {
      id: `${seed}-${index}`,
      title: label,
      src,
      downloadName: `xcr8-${useCase}-${style}-${ratio.replace(":", "x")}-${index + 1}.png`,
    };
  };

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanSubject = cleanText(subject);
    const cleanMood = cleanText(mood);
    const cleanPalette = cleanText(palette);

    if (!cleanSubject) return;
    if (cleanSubject.length < 10) {
      setError("Describe the subject in a bit more detail so results can be higher quality.");
      return;
    }

    setGenerating(true);
    setError(null);

    for (const image of images) {
      URL.revokeObjectURL(image.src);
    }
    setImages([]);

    const settled = await Promise.allSettled(
      variationLabels.map((label, index) =>
        generateVariation(label, index, cleanSubject, cleanMood, cleanPalette),
      ),
    );

    setPromptPreview(buildPrompt(cleanSubject, cleanMood, cleanPalette, variationDirections[0]));

    const built: GeneratedImage[] = [];
    for (const item of settled) {
      if (item.status === "fulfilled") {
        built.push(item.value);
      }
    }

    if (built.length === 0) {
      setError("Could not generate images right now. Please try again.");
    } else {
      setImages(built);
      if (built.length < variationLabels.length) {
        setError(
          `Generated ${built.length} of ${variationLabels.length} images. Please regenerate for more.`,
        );
      }
    }

    setGenerating(false);
  };

  const handleRegenerateVariation = async (target: GeneratedImage, index: number) => {
    const cleanSubject = cleanText(subject);
    const cleanMood = cleanText(mood);
    const cleanPalette = cleanText(palette);

    if (!cleanSubject || cleanSubject.length < 10) {
      setError("Add a slightly more detailed subject before regenerating.");
      return;
    }

    setRegeneratingImageId(target.id);
    setError(null);

    try {
      const regenerated = await generateVariation(
        variationLabels[index] ?? "Alternative",
        index,
        cleanSubject,
        cleanMood,
        cleanPalette,
      );

      setImages((previous) =>
        previous.map((item) => {
          if (item.id !== target.id) return item;
          URL.revokeObjectURL(item.src);
          return regenerated;
        }),
      );
    } catch {
      setError("Could not regenerate this variation right now. Please try again.");
    } finally {
      setRegeneratingImageId(null);
    }
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

  const applyPreset = (preset: GenerationPreset) => {
    setSubject(preset.subject);
    setStyle(preset.style);
    setRatio(preset.ratio);
    setUseCase(preset.style === "editorial" ? "product-still" : "ad-creative");
    setMood(preset.mood);
    setPalette(preset.palette);
    setCameraAngle(preset.camera);
    setLightingStyle(preset.lighting);
    setError(null);
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
            <p className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Quick presets
            </p>
            <div className="grid grid-cols-2 gap-2">
              {generationPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

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

          <select
            value={useCase}
            onChange={(e) => {
              const selected = e.target.value as UseCase;
              setUseCase(selected);
              setRatio(useCaseRatios[selected]);
            }}
            className="xcr8-input"
          >
            <option value="ad-creative">Use case: Ad Creative</option>
            <option value="product-still">Use case: Product Still</option>
            <option value="portrait">Use case: Portrait</option>
            <option value="thumbnail">Use case: Thumbnail</option>
            <option value="sports-action">Use case: Sports Action</option>
          </select>

          <select
            value={realism}
            onChange={(e) => setRealism(e.target.value as RealismLevel)}
            className="xcr8-input"
          >
            <option value="balanced">Photorealism: Balanced</option>
            <option value="realistic">Photorealism: Realistic</option>
            <option value="ultra">Photorealism: Ultra</option>
          </select>

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

          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={cameraAngle}
              onChange={(e) => setCameraAngle(e.target.value as CameraAngle)}
              className="xcr8-input"
            >
              <option value="eye-level">Camera: Eye level</option>
              <option value="low-angle">Camera: Low angle</option>
              <option value="overhead">Camera: Overhead</option>
              <option value="close-up">Camera: Close up</option>
            </select>
            <select
              value={lightingStyle}
              onChange={(e) => setLightingStyle(e.target.value as LightingStyle)}
              className="xcr8-input"
            >
              <option value="soft daylight">Lighting: Soft daylight</option>
              <option value="golden hour">Lighting: Golden hour</option>
              <option value="studio key light">Lighting: Studio key light</option>
              <option value="neon night">Lighting: Neon night</option>
            </select>
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
            Photorealism mode controls strictness and internal rerolls. Generated images are loaded
            as downloadable files to reduce broken renders.
          </p>

          {promptPreview ? (
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400 light:border-slate-200 light:bg-white light:text-slate-600">
              Prompt brief: {promptPreview}
            </div>
          ) : null}
        </form>

        <div className="space-y-3.5">
          {images.length ? (
            images.map((image, index) => (
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

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleImageDownload(image.src, image.downloadName)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
                  >
                    <Download size={12} />
                    Download image
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(regeneratingImageId)}
                    onClick={() => void handleRegenerateVariation(image, index)}
                    className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-300 transition hover:bg-violet-500/20 disabled:opacity-60"
                  >
                    <RefreshCw
                      size={12}
                      className={regeneratingImageId === image.id ? "animate-spin" : ""}
                    />
                    {regeneratingImageId === image.id ? "Regenerating..." : "Regenerate this"}
                  </button>
                </div>
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
