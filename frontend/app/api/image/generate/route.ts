import { NextRequest } from "next/server";
import sharp from "sharp";

export const dynamic = "force-dynamic";

const MIN_DIMENSION = 512;
const MAX_DIMENSION = 1792;
const MIN_IMAGE_BYTES_STRICT = 35_000;
const MIN_IMAGE_BYTES_RELAXED = 10_000;
const FETCH_TIMEOUT_MS = 25_000;
const GLOBAL_QUALITY_NEGATIVE =
  "blurry, low resolution, noisy image, cgi look, deformed anatomy, extra limbs, extra fingers, duplicate body parts, duplicated objects, multiple balls, duplicate football, distorted face, watermark, logo, text overlay";

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function buildCandidateUrls(
  prompt: string,
  width: number,
  height: number,
  baseSeed: number,
): string[] {
  const encodedPrompt = encodeURIComponent(prompt);
  const common = `width=${width}&height=${height}&nologo=true`;
  return [
    `https://image.pollinations.ai/prompt/${encodedPrompt}?${common}&model=flux&enhance=true&seed=${baseSeed}`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?${common}&model=flux&enhance=true&seed=${baseSeed + 97}`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?${common}&model=flux-realism&enhance=true&seed=${baseSeed + 197}`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?${common}&model=turbo&enhance=true&seed=${baseSeed + 307}`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?${common}&model=flux&safe=true&seed=${baseSeed + 409}`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?${common}&model=turbo&safe=true&seed=${baseSeed + 503}`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?${common}&seed=${baseSeed + 607}`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?seed=${baseSeed + 709}`,
  ];
}

type CandidateResult = {
  body: ArrayBuffer;
  contentType: string;
  score: number;
  sourceUrl: string;
};

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

function mimeScore(contentType: string): number {
  if (contentType.includes("png")) return 2200;
  if (contentType.includes("webp")) return 1800;
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return 1200;
  return 0;
}

function isSupportedOutput(contentType: string): boolean {
  return (
    contentType.includes("png") ||
    contentType.includes("webp") ||
    contentType.includes("jpeg") ||
    contentType.includes("jpg") ||
    contentType.includes("octet-stream")
  );
}

async function appearsToBeImage(body: ArrayBuffer): Promise<boolean> {
  try {
    const metadata = await sharp(Buffer.from(body), { animated: false }).metadata();
    return Boolean(metadata.format && metadata.width && metadata.height);
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "image/*",
        "User-Agent": "Xcr8-ImageGenerator/1.0",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function scoreCandidate(contentType: string, bodyLength: number): number {
  return bodyLength + mimeScore(contentType);
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

async function fetchCandidate(url: string, minBytes: number): Promise<CandidateResult | null> {
  try {
    const upstream = await fetchWithTimeout(url);

    if (!upstream.ok) return null;
    const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
    if (!(contentType.startsWith("image/") || contentType.includes("octet-stream"))) return null;
    if (!isSupportedOutput(contentType)) return null;

    const body = await upstream.arrayBuffer();
    if (body.byteLength === 0) return null;
    if (body.byteLength < minBytes) return null;
    if (!(await appearsToBeImage(body))) return null;

    return {
      body,
      contentType,
      score: scoreCandidate(contentType, body.byteLength),
      sourceUrl: url,
    };
  } catch {
    return null;
  }
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
  const seed = parsePositiveInt(request.nextUrl.searchParams.get("seed"), Date.now());
  const attempts = clamp(parsePositiveInt(request.nextUrl.searchParams.get("attempts"), 3), 1, 6);
  const enrichedPrompt = enrichPrompt(prompt);

  let best: CandidateResult | null = null;

  const passes = [
    { minBytes: MIN_IMAGE_BYTES_STRICT, retries: attempts, width, height },
    {
      minBytes: MIN_IMAGE_BYTES_RELAXED,
      retries: Math.max(3, attempts),
      width,
      height,
    },
    {
      minBytes: 0,
      retries: 2,
      width: clamp(Math.floor(width * 0.8), MIN_DIMENSION, MAX_DIMENSION),
      height: clamp(Math.floor(height * 0.8), MIN_DIMENSION, MAX_DIMENSION),
    },
  ] as const;

  for (const pass of passes) {
    for (let attempt = 0; attempt < pass.retries; attempt += 1) {
      const candidates = buildCandidateUrls(
        enrichedPrompt,
        pass.width,
        pass.height,
        seed + attempt * 541,
      );

      const settled = await Promise.all(
        candidates.map((url) => fetchCandidate(url, pass.minBytes)),
      );

      for (const candidate of settled) {
        if (!candidate) continue;
        if (!best || candidate.score > best.score) {
          best = candidate;
        }
      }

      if (best) break;
    }

    if (best) break;
  }

  if (best) {
    try {
      const polished = await polishCandidateImage(best.body, width, height);
      return new Response(new Uint8Array(polished), {
        status: 200,
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "no-store",
          "X-Xcr8-Image-Bytes": String(polished.byteLength),
          "X-Xcr8-Image-Source": best.sourceUrl,
        },
      });
    } catch {
      return new Response(best.body, {
        status: 200,
        headers: {
          "Content-Type": best.contentType,
          "Cache-Control": "no-store",
          "X-Xcr8-Image-Bytes": String(best.body.byteLength),
          "X-Xcr8-Image-Source": best.sourceUrl,
        },
      });
    }
  }

  return Response.json({ detail: "Image generation failed" }, { status: 502 });
}
