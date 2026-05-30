import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

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
  return [
    `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=${width}&height=${height}&seed=${baseSeed}&nologo=true&enhance=true`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=${width}&height=${height}&seed=${baseSeed + 97}&nologo=true&enhance=true`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?model=turbo&width=${width}&height=${height}&seed=${baseSeed + 211}&nologo=true`,
  ];
}

export async function GET(request: NextRequest) {
  const prompt = request.nextUrl.searchParams.get("prompt")?.trim() ?? "";
  if (!prompt) {
    return Response.json({ detail: "Missing prompt" }, { status: 400 });
  }

  const width = parsePositiveInt(request.nextUrl.searchParams.get("width"), 1024);
  const height = parsePositiveInt(request.nextUrl.searchParams.get("height"), 1280);
  const seed = parsePositiveInt(request.nextUrl.searchParams.get("seed"), Date.now());

  const candidates = buildCandidateUrls(prompt, width, height, seed);

  for (const url of candidates) {
    try {
      const upstream = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "image/*",
          "User-Agent": "Xcr8-ImageGenerator/1.0",
        },
      });

      if (!upstream.ok) continue;
      const contentType = upstream.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) continue;

      const body = await upstream.arrayBuffer();
      if (body.byteLength === 0) continue;

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
        },
      });
    } catch {
      continue;
    }
  }

  return Response.json({ detail: "Image generation failed" }, { status: 502 });
}
