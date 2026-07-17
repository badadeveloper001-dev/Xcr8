import sharp from "sharp";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_IMAGE_SIZE_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildTransformPreset(level: string, style: string) {
  const base =
    level === "balanced"
      ? {
          width: 1440,
          sharpen: { sigma: 0.9, m1: 0.9, m2: 0.3 },
          saturation: 1.04,
          brightness: 1.02,
          contrast: 1.02,
        }
      : level === "ultra"
        ? {
            width: 1792,
            sharpen: { sigma: 1.4, m1: 1.2, m2: 0.5 },
            saturation: 1.08,
            brightness: 1.04,
            contrast: 1.05,
          }
        : {
            width: 1600,
            sharpen: { sigma: 1.1, m1: 1.0, m2: 0.4 },
            saturation: 1.06,
            brightness: 1.03,
            contrast: 1.03,
          };

  switch (style) {
    case "product-polish":
      return {
        ...base,
        width: Math.max(base.width, 1600),
        sharpen: {
          sigma: base.sharpen.sigma + 0.15,
          m1: base.sharpen.m1 + 0.1,
          m2: base.sharpen.m2 + 0.05,
        },
        saturation: base.saturation + 0.01,
        brightness: base.brightness + 0.01,
        contrast: base.contrast + 0.04,
      };
    case "portrait-retouch":
      return {
        ...base,
        width: Math.max(base.width, 1520),
        sharpen: {
          sigma: base.sharpen.sigma - 0.1,
          m1: base.sharpen.m1 - 0.08,
          m2: base.sharpen.m2 - 0.02,
        },
        saturation: base.saturation - 0.01,
        brightness: base.brightness + 0.01,
        contrast: base.contrast + 0.01,
      };
    case "cinematic-pop":
      return {
        ...base,
        width: Math.max(base.width, 1600),
        sharpen: {
          sigma: base.sharpen.sigma + 0.05,
          m1: base.sharpen.m1 + 0.05,
          m2: base.sharpen.m2 + 0.02,
        },
        saturation: base.saturation + 0.08,
        brightness: base.brightness,
        contrast: base.contrast + 0.08,
      };
    default:
      return {
        ...base,
        width: Math.max(base.width, 1400),
      };
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const rawLevel = formData.get("level");
  const rawStyle = formData.get("style");
  const level = (typeof rawLevel === "string" ? rawLevel : "realistic").trim().toLowerCase();
  const style = (typeof rawStyle === "string" ? rawStyle : "clean-up").trim().toLowerCase();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No source image provided." }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Use png, jpg, jpeg, webp, or gif." },
      { status: 400 },
    );
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large. Max size is 12MB." }, { status: 400 });
  }

  const preset = buildTransformPreset(level, style);
  const inputBuffer = Buffer.from(await file.arrayBuffer());

  const pipeline = sharp(inputBuffer, { animated: false })
    .rotate()
    .resize({
      width: clamp(preset.width, 1024, 1792),
      height: 1792,
      fit: "inside",
      withoutEnlargement: false,
    })
    .normalize()
    .sharpen(preset.sharpen)
    .linear(preset.contrast, 0)
    .modulate({
      brightness: preset.brightness,
      saturation: preset.saturation,
    });

  const outputBuffer = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();

  return new Response(new Uint8Array(outputBuffer), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
      "X-Xcr8-Enhancement-Level": level,
    },
  });
}
