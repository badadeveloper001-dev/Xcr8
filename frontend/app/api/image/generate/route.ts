import { NextRequest } from "next/server";
import sharp from "sharp";

export const dynamic = "force-dynamic";

const MIN_DIMENSION = 512;
const MAX_DIMENSION = 1792;
const FETCH_TIMEOUT_MS = 120_000;
const GLOBAL_QUALITY_NEGATIVE =
  "blurry, low resolution, noisy image, cgi look, deformed anatomy, extra limbs, extra fingers, duplicate body parts, duplicated objects, multiple balls, duplicate football, distorted face, watermark, logo, text overlay";

async function fetchBackendImage(
  origin: string,
  userId: number,
  prompt: string,
  width: number,
  height: number,
  quality: "standard" | "high",
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(`${origin}/api/v1/ai/image/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        user_id: userId,
        prompt,
        width,
        height,
        quality,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
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

  // ── Intent analysis ──────────────────────────────────────────────────────
  const isSports = [
    "football",
    "soccer",
    "basketball",
    "athlete",
    "striker",
    "goalkeeper",
    "stadium",
    "match",
    "sport",
    "tennis",
    "rugby",
    "cricket",
  ].some((k) => lower.includes(k));
  const isPortrait = [
    "portrait",
    "person",
    "face",
    "selfie",
    "headshot",
    "woman",
    "man",
    "girl",
    "boy",
    "model",
    "human",
  ].some((k) => lower.includes(k));
  const isProduct = [
    "product",
    "package",
    "bottle",
    "jar",
    "box",
    "gadget",
    "device",
    "shoe",
    "bag",
    "watch",
    "perfume",
  ].some((k) => lower.includes(k));
  const isFood = [
    "food",
    "meal",
    "dish",
    "recipe",
    "restaurant",
    "coffee",
    "pizza",
    "burger",
    "drink",
    "smoothie",
    "cake",
  ].some((k) => lower.includes(k));
  const isFashion = [
    "fashion",
    "outfit",
    "clothing",
    "dress",
    "streetwear",
    "style",
    "lookbook",
    "wardrobe",
  ].some((k) => lower.includes(k));
  const isLandscape = [
    "landscape",
    "nature",
    "cityscape",
    "aerial",
    "mountain",
    "ocean",
    "forest",
    "sky",
    "sunset",
    "architecture",
  ].some((k) => lower.includes(k));

  // ── Base quality always applied ──────────────────────────────────────────
  const baseQuality =
    "high-end professional photography, tack-sharp focus, natural lighting, physically plausible lighting";

  // ── Domain-specific quality modifiers ───────────────────────────────────
  const domainQuality: string[] = [];
  if (isSports)
    domainQuality.push(
      "single athlete in motion, full body visible, clear limbs and fingers, exactly one ball visible, dynamic sports freeze-frame, crisp action shot, no duplicate subjects",
    );
  if (isPortrait)
    domainQuality.push(
      "accurate facial anatomy, natural skin texture, realistic eyes, expressive but not distorted, even skin tone, correct hand anatomy",
    );
  if (isProduct)
    domainQuality.push(
      "hero product centred, clean background, precise material rendering, accurate reflections, no duplicate items",
    );
  if (isFood)
    domainQuality.push(
      "food styling, appetising plating, natural steam or texture, rich colour, macro detail",
    );
  if (isFashion)
    domainQuality.push(
      "fashion editorial look, well-fitted clothing, natural fabric drape, clean composition",
    );
  if (isLandscape)
    domainQuality.push("wide dynamic range, natural colours, sharp horizon, atmospheric depth");
  if (domainQuality.length === 0) domainQuality.push("clean composition, realistic proportions");

  const withScaffold = [
    compact,
    baseQuality,
    ...domainQuality,
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
  const userId = parsePositiveInt(request.nextUrl.searchParams.get("user_id"), 0);
  if (!userId) {
    return Response.json({ detail: "Sign in before generating an image." }, { status: 401 });
  }
  if (!prompt) {
    return Response.json({ detail: "Missing prompt" }, { status: 400 });
  }
  // Truncate silently — never reject because of length.
  const safePrompt = prompt.length > 4000 ? prompt.slice(0, 4000) : prompt;

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
  const enrichedPrompt = enrichPrompt(safePrompt);

  const requestedQuality =
    request.nextUrl.searchParams.get("quality")?.trim().toLowerCase() === "high"
      ? "high"
      : "standard";

  let backendResponse: Response;
  try {
    backendResponse = await fetchBackendImage(
      request.nextUrl.origin,
      userId,
      enrichedPrompt,
      width,
      height,
      requestedQuality,
    );
  } catch {
    return Response.json({ detail: "Image generation service is unavailable." }, { status: 502 });
  }

  if (!backendResponse.ok) {
    const payload = await backendResponse.json().catch(() => ({ detail: "Image generation failed" }));
    return Response.json(payload, { status: backendResponse.status });
  }

  const aiPayload = (await backendResponse.json()) as { image_base64?: string };
  const decodedImage = aiPayload.image_base64
    ? Buffer.from(aiPayload.image_base64, "base64")
    : null;
  const aiServiceBody: ArrayBuffer | null = decodedImage
    ? (decodedImage.buffer.slice(
        decodedImage.byteOffset,
        decodedImage.byteOffset + decodedImage.byteLength,
      ) as ArrayBuffer)
    : null;
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
