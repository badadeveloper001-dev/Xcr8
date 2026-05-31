"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Download, ImagePlus, RefreshCw } from "lucide-react";
import { StudioShell } from "@/components/ai-studio/studio-shell";
import { useCreatorStore } from "@/lib/store";

type GeneratedImage = {
  id: string;
  title: string;
  src: string;
  historySrc: string;
  downloadName: string;
  prompt: string;
  createdAt: string;
};

type HistoryImage = {
  id: string;
  title: string;
  src: string;
  downloadName: string;
  prompt: string;
  createdAt: string;
  settings: {
    subject: string;
    style: StyleKey;
    ratio: "4:5" | "1:1" | "16:9";
    mood: string;
    palette: string;
    cameraAngle: CameraAngle;
    lightingStyle: LightingStyle;
    useCase: UseCase;
    realism: RealismLevel;
  };
};

type RealismLevel = "balanced" | "realistic" | "ultra";
type CameraAngle = "eye-level" | "low-angle" | "overhead" | "close-up";
type LightingStyle = "soft daylight" | "golden hour" | "studio key light" | "neon night";
type UseCase = "ad-creative" | "product-still" | "portrait" | "thumbnail" | "sports-action";
type StyleKey = "cinematic" | "editorial" | "documentary" | "vibrant";

type GenerationPreset = {
  id: string;
  label: string;
  subject: string;
  style: StyleKey;
  ratio: "4:5" | "1:1" | "16:9";
  mood: string;
  palette: string;
  camera: CameraAngle;
  lighting: LightingStyle;
};

const styleNotes: Record<StyleKey, string> = {
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
const HISTORY_LIMIT = 30;

export default function ImageGeneratorPage() {
  const userId = useCreatorStore((s) => s.userId);
  const historyStorageKey = useMemo(
    () => `xcr8-image-history:v1:${userId ?? "anon"}`,
    [userId],
  );

  const [subject, setSubject] = useState(defaultPreset.subject);
  const [style, setStyle] = useState<StyleKey>(defaultPreset.style);
  const [mood, setMood] = useState(defaultPreset.mood);
  const [ratio, setRatio] = useState(defaultPreset.ratio);
  const [palette, setPalette] = useState(defaultPreset.palette);
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>(defaultPreset.camera);
  const [lightingStyle, setLightingStyle] = useState<LightingStyle>(defaultPreset.lighting);
  const [useCase, setUseCase] = useState<UseCase>("ad-creative");
  const [realism, setRealism] = useState<RealismLevel>("ultra");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [history, setHistory] = useState<HistoryImage[]>([]);
  const [promptPreview, setPromptPreview] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [regeneratingImageId, setRegeneratingImageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = subject.trim().length > 4;

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(historyStorageKey);
      if (!raw) {
        setHistory([]);
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setHistory([]);
        return;
      }

      const safe = parsed
        .filter(
          (entry): entry is HistoryImage =>
            typeof entry === "object" &&
            entry !== null &&
            "id" in entry &&
            "src" in entry &&
            "title" in entry &&
            "downloadName" in entry &&
            "prompt" in entry &&
            "createdAt" in entry &&
            typeof entry.id === "string" &&
            typeof entry.src === "string" &&
            typeof entry.title === "string" &&
            typeof entry.downloadName === "string" &&
            typeof entry.prompt === "string" &&
            typeof entry.createdAt === "string",
        )
        .slice(0, HISTORY_LIMIT);

      setHistory(safe);
    } catch {
      setHistory([]);
    }
  }, [historyStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(historyStorageKey, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
  }, [history, historyStorageKey]);

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
  ): Promise<{ blobUrl: string; historySrc: string }> => {
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

    const sourceHeader = response.headers.get("X-Xcr8-Image-Source")?.trim();
    const blobUrl = URL.createObjectURL(blob);
    return {
      blobUrl,
      historySrc: sourceHeader && sourceHeader.startsWith("http") ? sourceHeader : blobUrl,
    };
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
    const resolved = await resolveImageBlobUrl(
      prompt,
      dimensions.width,
      dimensions.height,
      seed,
      realismAttempts[realism],
    );
    const now = new Date().toISOString();

    return {
      id: `${seed}-${index}`,
      title: label,
      src: resolved.blobUrl,
      historySrc: resolved.historySrc,
      downloadName: `xcr8-${useCase}-${style}-${ratio.replace(":", "x")}-${index + 1}.png`,
      prompt,
      createdAt: now,
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
      setHistory((previous) => {
        const newEntries: HistoryImage[] = built.map((item) => ({
          id: item.id,
          title: item.title,
          src: item.historySrc,
          downloadName: item.downloadName,
          prompt: item.prompt,
          createdAt: item.createdAt,
          settings: {
            subject: cleanSubject,
            style,
            ratio,
            mood: cleanMood,
            palette: cleanPalette,
            cameraAngle,
            lightingStyle,
            useCase,
            realism,
          },
        }));

        return [...newEntries, ...previous].slice(0, HISTORY_LIMIT);
      });
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

      setHistory((previous) => {
        const next: HistoryImage = {
          id: regenerated.id,
          title: regenerated.title,
          src: regenerated.historySrc,
          downloadName: regenerated.downloadName,
          prompt: regenerated.prompt,
          createdAt: regenerated.createdAt,
          settings: {
            subject: cleanSubject,
            style,
            ratio,
            mood: cleanMood,
            palette: cleanPalette,
            cameraAngle,
            lightingStyle,
            useCase,
            realism,
          },
        };

        return [next, ...previous].slice(0, HISTORY_LIMIT);
      });
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

  const restoreFromHistory = (item: HistoryImage) => {
    setSubject(item.settings.subject);
    setStyle(item.settings.style);
    setRatio(item.settings.ratio);
    setMood(item.settings.mood);
    setPalette(item.settings.palette);
    setCameraAngle(item.settings.cameraAngle);
    setLightingStyle(item.settings.lightingStyle);
    setUseCase(item.settings.useCase);
    setRealism(item.settings.realism);
    setPromptPreview(item.prompt);
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

          <section className="surface-card rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="section-kicker">Generation History</p>
                <p className="text-xs text-slate-400 light:text-slate-600">
                  {history.length} saved image{history.length === 1 ? "" : "s"}
                </p>
              </div>
              {history.length ? (
                <button
                  type="button"
                  onClick={() => setHistory([])}
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700"
                >
                  Clear history
                </button>
              ) : null}
            </div>

            {history.length ? (
              <div className="space-y-3">
                {history.slice(0, 12).map((item) => (
                  <article key={item.id} className="surface-soft rounded-xl p-3">
                    <img
                      src={item.src}
                      alt={item.title}
                      loading="lazy"
                      className="h-auto w-full rounded-lg border border-white/10 bg-black/20 object-cover"
                    />
                    <p className="mt-2 text-sm font-medium text-white light:text-slate-900">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => restoreFromHistory(item)}
                        className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-xs text-violet-300 transition hover:bg-violet-500/20"
                      >
                        Reuse settings
                      </button>
                      <button
                        type="button"
                        onClick={() => handleImageDownload(item.src, item.downloadName)}
                        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 light:border-slate-200 light:bg-white light:text-slate-700"
                      >
                        Download
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 light:text-slate-600">
                Your generated images will be saved here automatically.
              </p>
            )}
          </section>
        </div>
      </div>
    </StudioShell>
  );
}
