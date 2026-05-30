import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MIN_DIMENSION = 512;
const MAX_DIMENSION = 1792;
const MIN_IMAGE_BYTES = 42_000;
const FETCH_TIMEOUT_MS = 20_000;

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
  ];
}

type CandidateResult = {
  body: ArrayBuffer;
  contentType: string;
  score: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  const attempts = clamp(parsePositiveInt(request.nextUrl.searchParams.get("attempts"), 2), 1, 4);

  let best: CandidateResult | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidates = buildCandidateUrls(prompt, width, height, seed + attempt * 541);

    for (const url of candidates) {
      try {
        const upstream = await fetchWithTimeout(url);

        if (!upstream.ok) continue;
        const contentType = upstream.headers.get("content-type") ?? "";
        if (!contentType.startsWith("image/")) continue;
        if (!isSupportedOutput(contentType)) continue;

        const body = await upstream.arrayBuffer();
        if (body.byteLength === 0) continue;
        if (body.byteLength < MIN_IMAGE_BYTES) continue;

        const score = body.byteLength + mimeScore(contentType);

        if (!best || score > best.score) {
          best = { body, contentType, score };
        }
      } catch {
        continue;
      }
    }
  }

  if (best) {
    return new Response(best.body, {
      status: 200,
      headers: {
        "Content-Type": best.contentType,
        "Cache-Control": "no-store",
        "X-Xcr8-Image-Bytes": String(best.body.byteLength),
      },
    });
  }

  return Response.json({ detail: "Image generation failed" }, { status: 502 });
}
