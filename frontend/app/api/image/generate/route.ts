import { NextRequest } from "next/server";
import sharp from "sharp";

export const dynamic = "force-dynamic";

const MIN_DIMENSION = 512;
const MAX_DIMENSION = 1792;
const FETCH_TIMEOUT_MS = 25_000;
const GLOBAL_QUALITY_NEGATIVE =
  "blurry, low resolution, noisy image, cgi look, deformed anatomy, extra limbs, extra fingers, duplicate body parts, duplicated objects, multiple balls, duplicate football, distorted face, watermark, logo, text overlay";

async function fetchAiServiceImage(
  origin: string,
  prompt: string,
  width: number,
  height: number,
): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${origin}/_/ai-services/image/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        width,
        height,
        quality: "high",
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      image_base64?: string;
      mime_type?: string;
    };
    if (!payload.image_base64) {
      return null;
    }
    const bytes = Buffer.from(payload.image_base64, "base64");
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function enrichPrompt(rawPrompt: string): string {
  const compact = rawPrompt.trim().replace(/\s+/g, " ");
  const lower = compact.toLowerCase();

  const baseQuality =
    "high-end professional photography, tack-sharp focus, natural skin texture, physically plausible lighting, accurate anatomy";

  const sportsKeywords = ["football", "soccer", "striker", "goalkeeper", "stadium", "match"];
  const isSportsPrompt = sportsKeywords.some((keyword) => lower.includes(keyword));

  const sportsQuality =
    "single athlete in motion, full body visible, clear limbs and fingers, exactly one football visible, only one ball in frame, no duplicate footballs, realistic single-ball contact, dynamic grass spray, freeze-frame sports action";

  const withScaffold = [
    compact,
    baseQuality,
    isSportsPrompt ? sportsQuality : "clean composition, realistic proportions",
    "no text overlay",
    GLOBAL_QUALITY_NEGATIVE,
  ]
    .filter(Boolean)
    .join(", ");

  return withScaffold;
}

async function appearsToBeImage(body: ArrayBuffer): Promise<boolean> {
  try {
    const metadata = await sharp(Buffer.from(body), { animated: false }).metadata();
    return Boolean(metadata.format && metadata.width && metadata.height);
  } catch {
    return false;
  }
}

async function polishCandidateImage(
  body: ArrayBuffer,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(Buffer.from(body), { animated: false })
    .rotate()
    .resize({
      width,
      height,
      fit: "inside",
      withoutEnlargement: false,
    })
    .normalize()
    .sharpen({ sigma: 1.2, m1: 1.0, m2: 0.45 })
    .modulate({ brightness: 1.01, saturation: 1.03 })
    .webp({ quality: 92, effort: 5 })
    .toBuffer();
}

export async function GET(request: NextRequest) {
  const prompt = request.nextUrl.searchParams.get("prompt")?.trim() ?? "";
  if (!prompt) {
    return Response.json({ detail: "Missing prompt" }, { status: 400 });
  }
  if (prompt.length > 1400) {
    return Response.json({ detail: "Prompt is too long" }, { status: 400 });
  }

  const width = clamp(
    parsePositiveInt(request.nextUrl.searchParams.get("width"), 1024),
    MIN_DIMENSION,
    MAX_DIMENSION,
  );
  const height = clamp(
    parsePositiveInt(request.nextUrl.searchParams.get("height"), 1280),
    MIN_DIMENSION,
    MAX_DIMENSION,
  );
  const enrichedPrompt = enrichPrompt(prompt);

  const aiServiceBody = await fetchAiServiceImage(
    request.nextUrl.origin,
    enrichedPrompt,
    width,
    height,
  );
  if (aiServiceBody) {
    try {
      if (!(await appearsToBeImage(aiServiceBody))) {
        return Response.json({ detail: "Image generation failed" }, { status: 502 });
      }
      const polished = await polishCandidateImage(aiServiceBody, width, height);
      return new Response(new Uint8Array(polished), {
        status: 200,
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "no-store",
          "X-Xcr8-Image-Bytes": String(polished.byteLength),
          "X-Xcr8-Image-Source": "xcr8-ai-service",
        },
      });
    } catch {
      return new Response(aiServiceBody, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
          "X-Xcr8-Image-Source": "xcr8-ai-service",
        },
      });
    }
  }

  return Response.json(
    {
      detail:
        "High-quality image generation is currently unavailable. Please try again in a moment.",
    },
    { status: 503 },
  );
}
