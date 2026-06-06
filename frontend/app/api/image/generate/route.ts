import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MIN_DIMENSION = 512;
const MAX_DIMENSION = 1792;
const MIN_IMAGE_BYTES_STRICT = 42_000;
const MIN_IMAGE_BYTES_RELAXED = 18_000;
const FETCH_TIMEOUT_MS = 12_000;
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
  const common = `model=flux&width=${width}&height=${height}&nologo=true&enhance=true`;
  return [
    `https://image.pollinations.ai/prompt/${encodedPrompt}?${common}&seed=${baseSeed}`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?${common}&seed=${baseSeed + 97}`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?${common}&seed=${baseSeed + 197}&safe=true`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?${common}&seed=${baseSeed + 307}`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?${common}&seed=${baseSeed + 409}&safe=true`,
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
    contentType.includes("jpg")
  );
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

function escapeSvgText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildFallbackSvg(prompt: string, width: number, height: number): string {
  const safePrompt = escapeSvgText(prompt.slice(0, 180));
  const safeWidth = clamp(width, MIN_DIMENSION, MAX_DIMENSION);
  const safeHeight = clamp(height, MIN_DIMENSION, MAX_DIMENSION);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#09111f" />
      <stop offset="100%" stop-color="#12263f" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="38%" r="60%">
      <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.26" />
      <stop offset="100%" stop-color="#22d3ee" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" />
  <circle cx="${Math.round(safeWidth * 0.72)}" cy="${Math.round(safeHeight * 0.28)}" r="${Math.round(Math.min(safeWidth, safeHeight) * 0.28)}" fill="#8b5cf6" fill-opacity="0.12" />
  <circle cx="${Math.round(safeWidth * 0.22)}" cy="${Math.round(safeHeight * 0.72)}" r="${Math.round(Math.min(safeWidth, safeHeight) * 0.24)}" fill="#22d3ee" fill-opacity="0.12" />
  <rect width="100%" height="100%" fill="url(#glow)" />
  <rect x="${Math.round(safeWidth * 0.08)}" y="${Math.round(safeHeight * 0.74)}" width="${Math.round(safeWidth * 0.84)}" height="${Math.max(2, Math.round(safeHeight * 0.015))}" rx="${Math.max(2, Math.round(safeHeight * 0.007))}" fill="#e2e8f0" fill-opacity="0.3" />
  <text x="50%" y="48%" fill="#f8fafc" font-family="Arial, sans-serif" font-size="${Math.max(20, Math.round(Math.min(safeWidth, safeHeight) * 0.06))}" font-weight="700" text-anchor="middle">Xcr8 Image</text>
  <text x="50%" y="58%" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="${Math.max(12, Math.round(Math.min(safeWidth, safeHeight) * 0.024))}" text-anchor="middle">${safePrompt}</text>
</svg>`;
}

async function fetchCandidate(url: string, minBytes: number): Promise<CandidateResult | null> {
  try {
    const upstream = await fetchWithTimeout(url);

    if (!upstream.ok) return null;
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    if (!isSupportedOutput(contentType)) return null;

    const body = await upstream.arrayBuffer();
    if (body.byteLength === 0) return null;
    if (body.byteLength < minBytes) return null;

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
  const attempts = clamp(parsePositiveInt(request.nextUrl.searchParams.get("attempts"), 2), 1, 5);
  const enrichedPrompt = enrichPrompt(prompt);

  let best: CandidateResult | null = null;

  const passes = [
    { minBytes: MIN_IMAGE_BYTES_STRICT, retries: attempts, width, height },
    {
      minBytes: MIN_IMAGE_BYTES_RELAXED,
      retries: Math.max(2, attempts - 1),
      width,
      height,
    },
    {
      minBytes: MIN_IMAGE_BYTES_RELAXED,
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

  const fallbackSvg = buildFallbackSvg(enrichedPrompt, width, height);
  return new Response(fallbackSvg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store",
      "X-Xcr8-Image-Source": "local-fallback-svg",
    },
  });
}
